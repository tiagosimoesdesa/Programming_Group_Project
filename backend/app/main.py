import asyncio
import secrets
import threading
import time
import uuid
from contextlib import asynccontextmanager, suppress
from anyio import CapacityLimiter, to_thread
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, Response, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .scoring import beer_points
from sqlalchemy import Integer, case, cast, delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession
from . import storage
from .db import Session, get_db
from .models import Competition, LoginAttempt, Membership, RefreshSession, Submission, User, Reaction, ChallengeClaim, ChallengeVote, PartyRound
from .schemas import AccessToken, BattleOut, BattleTeamChoice, CreateCompetition, Credentials, EventDetail, EventOut, JoinCompetition, PhotoOut, Profile, RefreshIn, Register, Tokens, ReactionIn, ClaimIn, VoteIn, SocialOut, PartyOut
from .security import REFRESH_SECONDS, current_user, decode, digest, dummy_hash, hash_password, issue_tokens, password_matches, rotate


UPLOAD_CONCURRENCY = 6

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Limit general work and give slower password and photo jobs their own queues.
    to_thread.current_default_thread_limiter().total_tokens = 12
    yield {
        "auth_limiter": CapacityLimiter(settings.password_hash_concurrency),
        "upload_limiter": CapacityLimiter(UPLOAD_CONCURRENCY),
    }


app = FastAPI(title="BEERREAL", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True, allow_methods=["GET", "POST", "PUT"], allow_headers=["Authorization", "Content-Type", "Idempotency-Key"])

PARTY_ROUND_SECONDS = 30 * 60
PARTY_POINTS = 2
WEB_REFRESH_COOKIE = "beerreal_refresh"
BATTLE_DURATIONS = {600, 1800, 2700, 3600, 5400, 7200, 10800, 14400, 18000, 21600, 25200, 32400, 36000}
PARTY_PROMPTS = [
    ("group", "Group selfie with everyone’s consent"),
    ("yellow", "Find something yellow"),
    ("movie", "Recreate a movie-poster pose"),
    ("bald", "Take a photo with a bald friend who agrees"),
    ("matching", "Find two people wearing matching colours"),
    ("faces", "Make the funniest group face"),
    ("reflection", "Create a reflection photo"),
    ("pointing", "Get everyone pointing in the same direction"),
    ("heart", "Make a heart shape together"),
    ("glasses", "Take a photo with someone wearing glasses who agrees"),
    ("perspective", "Create a forced-perspective illusion"),
    ("dance", "Capture the best dance pose"),
    ("album", "Recreate an album cover"),
    ("accessory", "Find the most unusual hat or accessory"),
    ("height", "Line up a group by height"),
    ("letter", "Form a letter using people"),
]
LIVE_REVISION_CACHE_SECONDS = 0.25
LIVE_HEARTBEAT_SECONDS = 2
_live_revision_cache: dict[str, tuple[float, str]] = {}
_live_revision_locks: dict[str, threading.Lock] = {}
_live_revision_guard = threading.Lock()
_live_revision_reads: dict[tuple[asyncio.AbstractEventLoop, str], asyncio.Task[str]] = {}


def _read_live_revision(event_id: str):
    with Session() as db:
        event = db.get(Competition, event_id)
        if not event:
            raise HTTPException(404, "Competition not found")
        party_round = active_party_round(db, event)
        revision = f"{event.revision}:{party_round.sequence if party_round else -1}"
        return f"{revision}:ended" if battle_ends_at(event) and effective_ended_at(event) else revision


def _cached_live_revision(event_id: str):
    with _live_revision_guard:
        lock = _live_revision_locks.setdefault(event_id, threading.Lock())
    with lock:
        now = time.monotonic()
        with _live_revision_guard:
            cached = _live_revision_cache.get(event_id)
        if cached and cached[0] > now:
            return cached[1]
        revision = _read_live_revision(event_id)
        with _live_revision_guard:
            _live_revision_cache[event_id] = (time.monotonic() + LIVE_REVISION_CACHE_SECONDS, revision)
            if len(_live_revision_cache) > 256:
                expired = [key for key, value in _live_revision_cache.items() if value[0] <= now]
                for key in expired:
                    _live_revision_cache.pop(key, None)
        return revision


async def live_revision(event_id: str):
    with _live_revision_guard:
        cached = _live_revision_cache.get(event_id)
    if cached and cached[0] > time.monotonic():
        return cached[1]

    # A burst of sockets shares one pending database read for this competition.
    key = (asyncio.get_running_loop(), event_id)
    task = _live_revision_reads.get(key)
    if task is None:
        task = asyncio.create_task(to_thread.run_sync(_cached_live_revision, event_id))
        _live_revision_reads[key] = task

        def discard(completed):
            _live_revision_reads.pop(key, None)
            # Observe an error even if all waiting clients have disconnected.
            if not completed.cancelled():
                completed.exception()

        task.add_done_callback(discard)
    return await asyncio.shield(task)


def profile(user):
    return {"id": user.id, "username": user.username, "avatar_url": storage.photo_url(user.avatar)}


def battle_ends_at(event):
    if event.mode != "battle" or not event.battle_started_at:
        return None
    return event.battle_started_at + event.battle_duration_seconds


def effective_ended_at(event, now=None):
    if event.ended_at:
        return event.ended_at
    end = battle_ends_at(event)
    now = int(time.time()) if now is None else now
    return end if end and now >= end else None


def event_out(db, event, viewer_id=None, *, now=None, participants=None):
    membership = db.get(Membership, (event.id, viewer_id)) if viewer_id else None
    role = membership.role if membership else "player"
    if participants is None:
        participants = db.scalar(select(func.count()).select_from(Membership).where(Membership.competition_id == event.id, Membership.role == "player"))
    return serialize_event(event, role, participants, now)


def serialize_event(event, role, participants, now=None):
    return {"id": event.id, "name": event.name, "host_id": event.host_id, "code": event.code if role == "player" else "", "my_role": role, "created_at": event.created_at, "ended_at": effective_ended_at(event, now), "revision": event.revision, "participants": participants, "mode": event.mode, "party_started_at": event.party_started_at, "battle_started_at": event.battle_started_at}


def event_membership(db, event_id, user_id):
    row = db.execute(
        select(Competition, Membership).join(Membership)
        .where(Competition.id == event_id, Membership.user_id == user_id)
    ).first()
    if row is None:
        raise HTTPException(404, "Competition not found")
    return row


def member_event(db, event_id, user_id):
    return event_membership(db, event_id, user_id)[0]


def lock_event(db, event_id):
    # An UPDATE acquires a write lock on SQLite and a row lock on PostgreSQL.
    # Submissions, joins, and ending always use this same lock order.
    return db.scalar(
        update(Competition).where(Competition.id == event_id)
        .values(revision=Competition.revision + 1).returning(Competition)
        .execution_options(synchronize_session=False, populate_existing=True)
    )


def throttle(db, request, username):
    now = int(time.time())
    for scope in (f"ip:{request.client.host if request.client else 'unknown'}", f"user:{username}"):
        key = digest(scope)
        # Insert conflict is isolated so parallel first requests remain safe.
        try:
            with db.begin_nested():
                if not db.get(LoginAttempt, key):
                    db.add(LoginAttempt(key=key, count=0, window=now))
                    db.flush()
        except IntegrityError:
            pass
        db.execute(update(LoginAttempt).where(LoginAttempt.key == key, LoginAttempt.window <= now - 900).values(count=0, window=now))
        row = db.execute(update(LoginAttempt).where(LoginAttempt.key == key).values(count=LoginAttempt.count + 1).returning(LoginAttempt.count)).first()
        limit = 100 if scope.startswith("ip:") else 15
        if row[0] > limit:
            db.commit()
            raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")
    db.commit()


def require_trusted_web_origin(request: Request):
    if request.headers.get("origin") not in settings.cors_origins:
        raise HTTPException(403, "Untrusted browser origin")


def set_web_refresh_cookie(response: Response, token: str):
    response.set_cookie(
        WEB_REFRESH_COOKIE,
        token,
        max_age=REFRESH_SECONDS,
        path="/",
        secure=settings.public_url.startswith("https://"),
        httponly=True,
        samesite="lax",
    )


def clear_web_refresh_cookie(response: Response):
    response.delete_cookie(
        WEB_REFRESH_COOKIE,
        path="/",
        secure=settings.public_url.startswith("https://"),
        httponly=True,
        samesite="lax",
    )


@app.get("/health")
def health(db: DbSession = Depends(get_db)):
    db.execute(select(1))
    return {"status": "ok"}


def register_account(body: Register, request: Request):
    with Session() as db:
        throttle(db, request, body.username)
        user = User(username=body.username, password_hash=hash_password(body.password))
        db.add(user)
        try:
            db.flush()
            result = issue_tokens(db, user.id)
            db.commit()
            return result
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "That username is already taken")


def login_account(body: Credentials, request: Request):
    with Session() as db:
        throttle(db, request, body.username)
        user = db.execute(select(User.id, User.password_hash).where(User.username == body.username)).first()
        db.rollback()  # Release the connection before verifying the password.
        valid = password_matches(body.password, user.password_hash if user else dummy_hash)
        if not user or not valid:
            raise HTTPException(401, "Incorrect username or password")
        tokens = issue_tokens(db, user.id)
        db.commit()
        return tokens


@app.post("/auth/register", response_model=Tokens, status_code=201)
async def register(body: Register, request: Request):
    return await to_thread.run_sync(register_account, body, request, limiter=request.state.auth_limiter)


@app.post("/auth/login", response_model=Tokens)
async def login(body: Credentials, request: Request):
    return await to_thread.run_sync(login_account, body, request, limiter=request.state.auth_limiter)


@app.post("/auth/refresh", response_model=Tokens)
def refresh(body: RefreshIn, db: DbSession = Depends(get_db)):
    return rotate(db, body.refresh_token)


@app.post("/auth/logout", status_code=204)
def logout(body: RefreshIn, db: DbSession = Depends(get_db)):
    db.execute(delete(RefreshSession).where(RefreshSession.token_hash == digest(body.refresh_token)))
    db.commit()


@app.post("/auth/web/register", response_model=AccessToken, status_code=201)
async def web_register(body: Register, request: Request, response: Response):
    require_trusted_web_origin(request)
    tokens = await register(body, request)
    set_web_refresh_cookie(response, tokens["refresh_token"])
    return {"access_token": tokens["access_token"]}


@app.post("/auth/web/login", response_model=AccessToken)
async def web_login(body: Credentials, request: Request, response: Response):
    require_trusted_web_origin(request)
    tokens = await login(body, request)
    set_web_refresh_cookie(response, tokens["refresh_token"])
    return {"access_token": tokens["access_token"]}


@app.post("/auth/web/refresh", response_model=AccessToken)
def web_refresh(request: Request, response: Response, db: DbSession = Depends(get_db)):
    require_trusted_web_origin(request)
    token = request.cookies.get(WEB_REFRESH_COOKIE)
    if not token:
        raise HTTPException(401, "Session expired. Please sign in again.")
    try:
        tokens = rotate(db, token)
    except HTTPException as error:
        clear_web_refresh_cookie(response)
        raise HTTPException(
            error.status_code,
            error.detail,
            headers={"Set-Cookie": response.headers["set-cookie"]},
        )
    set_web_refresh_cookie(response, tokens["refresh_token"])
    return {"access_token": tokens["access_token"]}


@app.post("/auth/web/logout", status_code=204)
def web_logout(request: Request, response: Response, db: DbSession = Depends(get_db)):
    require_trusted_web_origin(request)
    token = request.cookies.get(WEB_REFRESH_COOKIE)
    if token:
        db.execute(delete(RefreshSession).where(RefreshSession.token_hash == digest(token)))
        db.commit()
    clear_web_refresh_cookie(response)


@app.get("/me", response_model=Profile)
def me(user: User = Depends(current_user)):
    return profile(user)


@app.put("/me/avatar", response_model=Profile)
async def avatar(request: Request, photo: UploadFile = File(), user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    return await to_thread.run_sync(store_avatar, photo, user, db, limiter=request.state.upload_limiter)


def store_avatar(photo, user, db):
    data = storage.validate_image(photo)
    key = f"avatars/{user.id}/{uuid.uuid4()}.jpg"
    old = user.avatar
    storage.put(key, data)
    try:
        user.avatar = key
        db.commit()
    except Exception:
        storage.remove(key)
        raise
    if old:
        storage.remove(old)
    return profile(user)


@app.get("/competitions", response_model=list[EventOut])
def events(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    # The user's role and player count belong in the list query. Looking each
    # up separately adds two database round trips per night in their history.
    participants = (
        select(func.count()).select_from(Membership)
        .where(Membership.competition_id == Competition.id, Membership.role == "player")
        .correlate(Competition).scalar_subquery()
    )
    rows = db.execute(
        select(Competition, Membership.role, participants).join(Membership)
        .where(Membership.user_id == user.id)
        .order_by(Competition.created_at.desc(), Competition.id)
    ).all()
    # FastAPI validates the response after the sync handler returns. Release
    # the connection here so queued validation cannot tie up the whole pool.
    db.commit()
    now = int(time.time())
    return [serialize_event(event, role, count, now) for event, role, count in rows]


@app.post("/competitions", response_model=EventOut, status_code=201)
def create_event(body: CreateCompetition, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    if body.mode == "battle":
        if (
            body.battle_duration_seconds not in BATTLE_DURATIONS
            or body.battle_points_visible is None
            or not body.battle_team_a_name
            or not body.battle_team_b_name
        ):
            raise HTTPException(422, "Choose a duration, point visibility, and two team names")
        if body.battle_team_a_name.casefold() == body.battle_team_b_name.casefold():
            raise HTTPException(422, "Team names must be different")
    for _ in range(5):
        event = Competition(
            name=body.name,
            mode=body.mode,
            host_id=user.id,
            code="".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(8)),
            battle_duration_seconds=body.battle_duration_seconds,
            battle_points_visible=body.battle_points_visible if body.battle_points_visible is not None else True,
            battle_team_a_name=body.battle_team_a_name,
            battle_team_b_name=body.battle_team_b_name,
        )
        try:
            db.add(event)
            db.flush()
            db.add(Membership(competition_id=event.id, user_id=user.id))
            db.commit()
            return event_out(db, event, user.id)
        except IntegrityError:
            db.rollback()
    raise HTTPException(503, "Please try creating the competition again")


@app.post("/competitions/join", response_model=EventOut)
def join(body: JoinCompetition, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    event = db.scalar(select(Competition).where((Competition.code == body.code.upper()) | (Competition.spectator_code == body.code.upper())))
    if not event:
        raise HTTPException(404, "Invitation code not found")
    event = lock_event(db, event.id)
    if db.get(Membership, (event.id, user.id)):
        db.rollback()
        return event_out(db, event, user.id)
    if effective_ended_at(event):
        raise HTTPException(409, "This competition has finished")
    if event.mode == "battle" and event.battle_started_at:
        raise HTTPException(409, "This battle has already started")
    db.add(Membership(competition_id=event.id, user_id=user.id, role="spectator" if event.spectator_code == body.code.upper() else "player"))
    db.commit()
    return event_out(db, event, user.id)


def photo_data(db, rows, viewer_id=None, people=()):
    photos = {row.id: row for row in rows}
    owners = {person.id: person for person in people}
    missing = {row.user_id for row in photos.values()} - owners.keys()
    if missing:
        owners.update((user.id, user) for user in db.scalars(select(User).where(User.id.in_(missing))))
    round_ids = {row.party_round_id for row in photos.values() if row.party_round_id}
    prompts = dict(db.execute(select(PartyRound.id, PartyRound.prompt).where(PartyRound.id.in_(round_ids))).all()) if round_ids else {}
    reactions = {photo_id: {} for photo_id in photos}
    my_reactions = {}
    if photos:
        for photo_id, emoji, count in db.execute(
            select(Reaction.submission_id, Reaction.emoji, func.count())
            .where(Reaction.submission_id.in_(photos))
            .group_by(Reaction.submission_id, Reaction.emoji)
        ):
            reactions[photo_id][emoji] = count
        if viewer_id:
            my_reactions = dict(db.execute(
                select(Reaction.submission_id, Reaction.emoji)
                .where(Reaction.submission_id.in_(photos), Reaction.user_id == viewer_id)
            ).all())
    return photos, owners, prompts, reactions, my_reactions


def render_photos(photos, owners, prompts, reactions, my_reactions):
    storage.prime_photo_urls([
        *(person.avatar for person in owners.values()),
        *(key for row in photos.values() for key in (row.rear, row.front)),
    ])
    profiles = {person.id: profile(person) for person in owners.values()}
    result = {
        row.id: render_photo(row, profiles[row.user_id], reactions[row.id], my_reactions.get(row.id), prompts.get(row.party_round_id))
        for row in photos.values()
    }
    return result, profiles


def render_photo(row, owner, reactions, my_reaction=None, prompt=None):
    count = row.beer_count if row.kind == "drink" else 0
    pints = row.pint_count if row.kind == "drink" else 0
    return {
        "id": row.id, "user": owner, "created_at": row.created_at,
        "rear_url": storage.photo_url(row.rear), "front_url": storage.photo_url(row.front),
        "beer_count": count, "pint_count": pints, "beer_points": beer_points(count, pints),
        "reactions": reactions, "my_reaction": my_reaction,
        "kind": row.kind, "challenge_prompt": prompt,
    }


def photo_out(db, row, viewer_id=None):
    data = photo_data(db, [row], viewer_id)
    db.commit()  # Release the read connection before signing private media.
    return render_photos(*data)[0][row.id]


def visible_submissions(event_id):
    approved = select(ChallengeClaim.submission_id).where(ChallengeClaim.competition_id == event_id, ChallengeClaim.round_id.is_not(None), ChallengeClaim.approved.is_(True))
    return or_(Submission.kind == "drink", Submission.id.in_(approved))


def score_rows(db, event_id):
    counts = select(
        Submission.user_id,
        func.sum(Submission.beer_count).label("n"),
        func.sum(beer_points(Submission.beer_count, Submission.pint_count)).label("points"),
    ).where(Submission.competition_id == event_id, Submission.kind == "drink").group_by(Submission.user_id).subquery()
    bonuses = select(ChallengeClaim.user_id, (func.count() * PARTY_POINTS).label("n")).where(
        ChallengeClaim.competition_id == event_id,
        ChallengeClaim.round_id.is_not(None),
        ChallengeClaim.approved.is_(True),
    ).group_by(ChallengeClaim.user_id).subquery()
    total = func.coalesce(counts.c.points, 0) + func.coalesce(bonuses.c.n, 0)
    return db.execute(
        select(User, Membership.team, func.coalesce(counts.c.n, 0), func.coalesce(bonuses.c.n, 0), total)
        .join(Membership, Membership.user_id == User.id)
        .outerjoin(counts, counts.c.user_id == User.id)
        .outerjoin(bonuses, bonuses.c.user_id == User.id)
        .where(Membership.competition_id == event_id, Membership.role == "player")
        .order_by(total.desc(), User.username)
    ).all()


def battle_state(db, event, viewer_id, rows=None, profiles=None, now=None):
    if event.mode != "battle":
        raise HTTPException(409, "This competition is not a battle")
    now = int(time.time()) if now is None else now
    membership = db.get(Membership, (event.id, viewer_id))
    end = battle_ends_at(event)
    finished = effective_ended_at(event, now)
    if event.ended_at and not event.battle_started_at:
        status = "cancelled"
    elif finished:
        status = "complete"
    elif event.battle_started_at:
        status = "active"
    else:
        status = "waiting"
    if rows is None:
        rows = score_rows(db, event.id)
    if profiles is None:
        storage.prime_photo_urls(person.avatar for person, *_ in rows)
        profiles = {person.id: profile(person) for person, *_ in rows}
    teams = []
    totals = {}
    for key, name in (("a", event.battle_team_a_name), ("b", event.battle_team_b_name)):
        team_rows = [row for row in rows if row[1] == key]
        total = sum(row[4] for row in team_rows)
        totals[key] = total
        reveal = status in ("waiting", "complete", "cancelled") or event.battle_points_visible or membership.team == key
        if not reveal:
            team_rows.sort(key=lambda row: row[0].username)
        members, rank, previous = [], 0, None
        for person, _, count, _challenge_points, points in team_rows:
            if points != previous:
                rank += 1
            members.append({
                **profiles[person.id],
                "count": count if reveal else None,
                "points": points if reveal else None,
                "rank": rank if reveal else None,
            })
            previous = points
        teams.append({"key": key, "name": name, "score": total if reveal else None, "members": members})
    winner = None
    if status == "complete":
        winner = "tie" if totals["a"] == totals["b"] else ("a" if totals["a"] > totals["b"] else "b")
    players = [row for row in rows]
    both_teams = any(row[1] == "a" for row in players) and any(row[1] == "b" for row in players)
    everyone_chose = bool(players) and all(row[1] in ("a", "b") for row in players)
    warning_at = end - ((event.battle_duration_seconds + 9) // 10) if end else None
    return {
        "status": status,
        "server_time": now,
        "duration_seconds": event.battle_duration_seconds,
        "started_at": event.battle_started_at,
        "ends_at": end,
        "warning_at": warning_at,
        "warning": status == "active" and now >= warning_at,
        "points_visible": event.battle_points_visible,
        "my_team": membership.team,
        "can_start": status == "waiting" and event.host_id == viewer_id and both_teams and everyone_chose,
        "can_change_team": status == "waiting",
        "can_leave": status == "waiting",
        "winner": winner,
        "teams": teams,
    }


@app.get("/competitions/{event_id}/battle", response_model=BattleOut)
def get_battle(event_id: str, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    event = member_event(db, event_id, user.id)
    return battle_state(db, event, user.id)


@app.put("/competitions/{event_id}/battle/team", response_model=BattleOut)
def choose_battle_team(event_id: str, body: BattleTeamChoice, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    event = member_event(db, event_id, user.id)
    if event.mode != "battle":
        raise HTTPException(409, "This competition is not a battle")
    event = lock_event(db, event_id)
    if event.battle_started_at or event.ended_at:
        raise HTTPException(409, "Teams are locked after the battle starts")
    membership = db.get(Membership, (event_id, user.id))
    if membership.role != "player":
        raise HTTPException(403, "Spectators cannot join a battle team")
    membership.team = body.team
    db.commit()
    return battle_state(db, event, user.id)


@app.post("/competitions/{event_id}/battle/start", response_model=BattleOut)
def start_battle(event_id: str, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    event = member_event(db, event_id, user.id)
    if event.mode != "battle":
        raise HTTPException(409, "This competition is not a battle")
    if event.host_id != user.id:
        raise HTTPException(403, "Only the host can start the battle")
    event = lock_event(db, event_id)
    if event.ended_at:
        raise HTTPException(409, "This battle has been cancelled")
    if event.battle_started_at:
        db.rollback()
        return battle_state(db, event, user.id)
    teams = list(db.scalars(select(Membership.team).where(Membership.competition_id == event_id, Membership.role == "player")))
    if not teams or any(team not in ("a", "b") for team in teams):
        raise HTTPException(409, "Every player must choose a team before the battle starts")
    if "a" not in teams or "b" not in teams:
        raise HTTPException(409, "Each team needs at least one player")
    event.battle_started_at = int(time.time())
    db.commit()
    return battle_state(db, event, user.id)


@app.post("/competitions/{event_id}/battle/leave", status_code=204)
def leave_battle(event_id: str, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    event = member_event(db, event_id, user.id)
    if event.mode != "battle":
        raise HTTPException(409, "This competition is not a battle")
    event = lock_event(db, event_id)
    if event.battle_started_at:
        raise HTTPException(409, "You cannot leave after the battle starts")
    if event.ended_at:
        raise HTTPException(409, "This battle is already closed")
    if event.host_id == user.id:
        event.ended_at = int(time.time())
    else:
        db.execute(delete(Membership).where(Membership.competition_id == event_id, Membership.user_id == user.id))
    db.commit()
    return None


@app.get("/competitions/{event_id}", response_model=EventDetail)
def detail(event_id: str, before: str | None = None, player: str | None = None, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    event, my_membership = event_membership(db, event_id, user.id)
    now = int(time.time())
    ended = effective_ended_at(event, now)
    rows = score_rows(db, event_id)
    private_active_battle = bool(event.battle_started_at and not ended and not event.battle_points_visible)
    query = select(Submission).where(Submission.competition_id == event_id, visible_submissions(event_id))
    if private_active_battle:
        teammates = select(Membership.user_id).where(Membership.competition_id == event_id, Membership.team == my_membership.team)
        query = query.where(Submission.user_id.in_(teammates))
    if player:
        query = query.where(Submission.user_id == player)
    if before:
        cursor = db.get(Submission, before)
        if not cursor or cursor.competition_id != event_id:
            raise HTTPException(400, "Invalid feed cursor")
        query = query.where((Submission.created_at < cursor.created_at) | ((Submission.created_at == cursor.created_at) & (Submission.id < cursor.id)))
    page = list(db.scalars(query.order_by(Submission.created_at.desc(), Submission.id.desc()).limit(21)))
    feed = page[:20]
    first, last = {}, {}
    if ended:
        # Find every player's first and last drink in one query, independent of the feed page.
        window = {"partition_by": Submission.user_id}
        ranked = select(
            Submission.id,
            func.row_number().over(**window, order_by=(Submission.created_at, Submission.id)).label("first"),
            func.row_number().over(**window, order_by=(Submission.created_at.desc(), Submission.id.desc())).label("last"),
        ).where(Submission.competition_id == event_id, Submission.kind == "drink").subquery()
        for photo, first_rank, last_rank in db.execute(
            select(Submission, ranked.c.first, ranked.c.last).join(ranked, ranked.c.id == Submission.id)
            .where(or_(ranked.c.first == 1, ranked.c.last == 1))
        ):
            if first_rank == 1:
                first[photo.user_id] = photo
            elif last_rank == 1:
                last[photo.user_id] = photo
    competition = event_out(db, event, user.id, now=now, participants=len(rows))
    data = photo_data(db, [*feed, *first.values(), *last.values()], user.id, (row[0] for row in rows))
    db.commit()  # Signing and serialization do not need a database connection.
    all_photos, profiles = render_photos(*data)
    standings, rank, previous = [], 0, None
    for person, team, count, challenge_points, points in rows:
        if private_active_battle and team != my_membership.team:
            continue
        if points != previous:
            rank += 1
        standings.append({**profiles[person.id], "count": count, "challenge_points": challenge_points, "points": points, "rank": rank, "team": team})
        previous = points
    recap = []
    if ended:
        for person, *_ in rows:
            first_photo, last_photo = first.get(person.id), last.get(person.id)
            recap.append({
                "user": profiles[person.id],
                "first": {**all_photos[first_photo.id], "my_reaction": None} if first_photo else None,
                "last": {**all_photos[last_photo.id], "my_reaction": None} if last_photo else None,
            })
    battle = battle_state(db, event, user.id, rows, profiles, now) if event.mode == "battle" else None
    return {"competition": competition, "standings": standings, "feed": [all_photos[row.id] for row in feed], "next_cursor": feed[-1].id if len(page) > len(feed) else None, "recap": recap, "battle": battle}


@app.post("/competitions/{event_id}/submissions", response_model=PhotoOut, status_code=201)
async def submit(event_id: str, request: Request, rear: UploadFile = File(), front: UploadFile = File(), beer_count: int = Form(1, ge=1, le=10), pint_count: int = Form(0, ge=0, le=10, description="Pints (exactly 0.5 L) included in beer_count; remaining beers are regular (below 0.5 L)."), idempotency_key: uuid.UUID = Header(), user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    return await to_thread.run_sync(
        submit_check_in, event_id, rear, front, beer_count, pint_count, idempotency_key, user, db,
        limiter=request.state.upload_limiter,
    )


def submit_check_in(event_id, rear, front, beer_count, pint_count, idempotency_key, user, db):
    current_event, membership = event_membership(db, event_id, user.id)
    if membership.role != "player":
        raise HTTPException(403, "Spectators cannot submit photos")
    if current_event.mode == "battle":
        if not current_event.battle_started_at or effective_ended_at(current_event):
            raise HTTPException(409, "Battle photos are accepted only while the battle is active")
        if not membership.team:
            raise HTTPException(409, "Choose a team before posting a battle photo")
    key = str(idempotency_key)
    existing_query = select(Submission).where(Submission.competition_id == event_id, Submission.user_id == user.id, Submission.idempotency_key == key)
    existing = db.scalar(existing_query)
    if existing:
        return photo_out(db, existing)
    if pint_count > beer_count:
        raise HTTPException(422, "Pint count cannot exceed total beer count")
    # Release the read connection before processing and uploading the photos.
    user_id = user.id
    db.commit()
    rear_data, front_data = storage.validate_image(rear), storage.validate_image(front)
    photo_id = str(uuid.uuid4())
    paths = [f"events/{event_id}/{photo_id}/{side}.jpg" for side in ("rear", "front")]
    uploaded = []
    committed = False
    try:
        for path, data in zip(paths, (rear_data, front_data)):
            uploaded.append(path)
            storage.put(path, data)
        event = lock_event(db, event_id)
        existing = db.scalar(existing_query)
        if existing:
            db.rollback()
            return photo_out(db, existing)
        if effective_ended_at(event):
            raise HTTPException(409, "This competition has finished. Your photo was not counted.")
        if event.mode == "battle" and not event.battle_started_at:
            raise HTTPException(409, "The battle has not started")
        row = Submission(id=photo_id, competition_id=event_id, user_id=user_id, idempotency_key=key, kind="drink", beer_count=beer_count, pint_count=pint_count, rear=paths[0], front=paths[1])
        db.add(row)
        db.commit()
        committed = True
        storage.prime_photo_urls([user.avatar, row.rear, row.front])
        return render_photo(row, profile(user), {})
    finally:
        if not committed:
            db.rollback()
            for path in uploaded:
                storage.remove(path)


@app.post("/competitions/{event_id}/end", response_model=EventOut)
def end(event_id: str, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    event = member_event(db, event_id, user.id)
    if event.host_id != user.id:
        raise HTTPException(403, "Only the host can finish this competition")
    if event.mode == "battle":
        raise HTTPException(409, "Battles finish automatically when their timer reaches zero")
    event = lock_event(db, event_id)
    if not event.ended_at:
        event.ended_at = int(time.time())
    db.commit()
    return event_out(db, event, user.id)


@app.put("/competitions/{event_id}/photos/{photo_id}/reaction", response_model=PhotoOut)
def react(event_id: str, photo_id: str, body: ReactionIn, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    event = member_event(db, event_id, user.id)
    photo = db.get(Submission, photo_id)
    if not photo or photo.competition_id != event_id or (photo.kind == "challenge" and not db.scalar(select(ChallengeClaim.approved).where(ChallengeClaim.submission_id == photo.id))):
        raise HTTPException(404, "Photo not found")
    if event.mode == "battle" and not event.battle_points_visible and not effective_ended_at(event):
        viewer = db.get(Membership, (event_id, user.id))
        owner = db.get(Membership, (event_id, photo.user_id))
        if event.battle_started_at and viewer.team != owner.team:
            raise HTTPException(404, "Photo not found")
    lock_event(db, event_id)
    db.execute(delete(Reaction).where(Reaction.submission_id == photo_id, Reaction.user_id == user.id))
    if body.emoji:
        db.add(Reaction(submission_id=photo_id, user_id=user.id, emoji=body.emoji))
    db.commit()
    return photo_out(db, photo, user.id)


@app.get("/media", include_in_schema=False)
def media(token: str):
    key = decode(token, "photo")["sub"]
    path = storage.local_path(key)
    if not path.is_file():
        raise HTTPException(404, "Photo not found")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=60"})


PROMPTS = {"group": "A group selfie (everyone agrees to the photo)", "yellow": "Find something yellow", "pose": "Recreate a pose together"}


def active_party_round(db, event, now=None):
    now = int(time.time()) if now is None else now
    if not event.party_started_at or event.ended_at:
        return None
    return db.scalar(select(PartyRound).where(PartyRound.competition_id == event.id, PartyRound.starts_at <= now, PartyRound.ends_at > now).order_by(PartyRound.sequence).limit(1))


def party_round_out(row):
    return {"id": row.id, "sequence": row.sequence, "prompt": row.prompt, "starts_at": row.starts_at, "ends_at": row.ends_at}


def claim_vote_totals(db, claims, viewer_id):
    if not claims:
        return {}
    return {
        claim_id: (total, bool(my_vote) if my_vote is not None else None)
        for claim_id, total, my_vote in db.execute(
            select(
                ChallengeVote.claim_id,
                func.count().filter(ChallengeVote.approve),
                func.max(case((ChallengeVote.user_id == viewer_id, cast(ChallengeVote.approve, Integer)))),
            )
            .where(ChallengeVote.claim_id.in_(claim.id for claim in claims))
            .group_by(ChallengeVote.claim_id)
        )
    }


def party_state(db, event, viewer_id):
    if event.mode != "party":
        raise HTTPException(409, "This night is in Classic Mode")
    now = int(time.time())
    visible_at = min(now, event.ended_at) if event.ended_at else now
    rounds = list(db.scalars(select(PartyRound).where(PartyRound.competition_id == event.id, PartyRound.starts_at <= visible_at).order_by(PartyRound.sequence)))
    current = next((row for row in rounds if not event.ended_at and row.ends_at > now), None)
    ends_at = event.party_started_at + len(PARTY_PROMPTS) * PARTY_ROUND_SECONDS if event.party_started_at else None
    if event.ended_at:
        status = "ended"
    elif not event.party_started_at:
        status = "waiting"
    elif now >= ends_at:
        status = "complete"
    else:
        status = "active"
    attempts = []
    scores = {}
    claim_rows = db.execute(
        select(ChallengeClaim, Submission, PartyRound.prompt)
        .join(Submission, Submission.id == ChallengeClaim.submission_id)
        .join(PartyRound, PartyRound.id == ChallengeClaim.round_id)
        .where(ChallengeClaim.competition_id == event.id)
        .order_by(ChallengeClaim.id.desc())
    ).all()
    totals = claim_vote_totals(db, [row[0] for row in claim_rows], viewer_id)
    players = db.scalar(select(func.count()).select_from(Membership).where(Membership.competition_id == event.id, Membership.role == "player"))
    data = photo_data(db, (row[1] for row in claim_rows), viewer_id)
    db.commit()
    photos, _ = render_photos(*data)
    for claim, photo, prompt in claim_rows:
        approvals, my_vote = totals.get(claim.id, (0, None))
        required = len(claim.voters) // 2 + 1
        result = "approved" if claim.approved else "not_approved" if event.ended_at else "pending"
        if claim.approved:
            scores[claim.user_id] = scores.get(claim.user_id, 0) + PARTY_POINTS
        attempts.append({"id": claim.id, "round_id": claim.round_id, "prompt": prompt, "photo": photos[photo.id], "approvals": approvals, "required": required, "status": result, "can_vote": not event.ended_at and viewer_id in claim.voters, "my_vote": my_vote})
    return {"status": status, "server_time": now, "started_at": event.party_started_at, "ends_at": ends_at, "can_start": event.host_id == viewer_id and not event.ended_at and not event.party_started_at and players >= 2, "active_round": party_round_out(current) if current else None, "rounds": [party_round_out(row) for row in rounds], "attempts": attempts, "scores": scores}


@app.get("/competitions/{event_id}/party", response_model=PartyOut)
def get_party(event_id: str, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    event = member_event(db, event_id, user.id)
    return party_state(db, event, user.id)


@app.post("/competitions/{event_id}/party/start", response_model=PartyOut)
def start_party(event_id: str, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    event = member_event(db, event_id, user.id)
    if event.mode != "party":
        raise HTTPException(409, "This night is in Classic Mode")
    if event.host_id != user.id:
        raise HTTPException(403, "Only the host can start Party Mode")
    event = lock_event(db, event_id)
    if event.ended_at:
        raise HTTPException(409, "This night has finished")
    if event.party_started_at:
        db.rollback()
        return party_state(db, event, user.id)
    players = db.scalar(select(func.count()).select_from(Membership).where(Membership.competition_id == event_id, Membership.role == "player"))
    if players < 2:
        raise HTTPException(409, "Invite at least one other player before starting Party Mode")
    started = int(time.time())
    event.party_started_at = started
    for sequence, (key, prompt) in enumerate(secrets.SystemRandom().sample(PARTY_PROMPTS, len(PARTY_PROMPTS))):
        db.add(PartyRound(competition_id=event.id, sequence=sequence, prompt_key=key, prompt=prompt, starts_at=started + sequence * PARTY_ROUND_SECONDS, ends_at=started + (sequence + 1) * PARTY_ROUND_SECONDS))
    db.commit()
    return party_state(db, event, user.id)


@app.post("/competitions/{event_id}/party/rounds/{round_id}/attempts", response_model=PartyOut, status_code=201)
async def submit_party_attempt(event_id: str, round_id: str, request: Request, rear: UploadFile = File(), front: UploadFile = File(), idempotency_key: uuid.UUID = Header(), user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    return await to_thread.run_sync(
        submit_challenge_photo, event_id, round_id, rear, front, idempotency_key, user, db,
        limiter=request.state.upload_limiter,
    )


def submit_challenge_photo(event_id, round_id, rear, front, idempotency_key, user, db):
    event = member_event(db, event_id, user.id)
    membership = db.get(Membership, (event_id, user.id))
    if membership.role != "player":
        raise HTTPException(403, "Spectators cannot submit challenges")
    if event.mode != "party" or event.ended_at:
        raise HTTPException(409, "Party challenges are not open")
    key = str(idempotency_key)
    existing_submission = db.scalar(select(Submission).where(Submission.competition_id == event_id, Submission.user_id == user.id, Submission.idempotency_key == key))
    if existing_submission:
        return party_state(db, event, user.id)
    party_round = active_party_round(db, event)
    if not party_round or party_round.id != round_id:
        raise HTTPException(409, "This challenge is no longer active")
    if db.scalar(select(ChallengeClaim).where(ChallengeClaim.round_id == round_id, ChallengeClaim.user_id == user.id)):
        raise HTTPException(409, "You already submitted this challenge")
    user_id = user.id
    db.rollback()
    rear_data, front_data = storage.validate_image(rear), storage.validate_image(front)
    photo_id = str(uuid.uuid4())
    paths = [f"events/{event_id}/party/{photo_id}/{side}.jpg" for side in ("rear", "front")]
    uploaded = []
    committed = False
    try:
        for path, data in zip(paths, (rear_data, front_data)):
            uploaded.append(path)
            storage.put(path, data)
        event = lock_event(db, event_id)
        existing_submission = db.scalar(select(Submission).where(Submission.competition_id == event_id, Submission.user_id == user_id, Submission.idempotency_key == key))
        if existing_submission:
            db.rollback()
            return party_state(db, event, user_id)
        party_round = active_party_round(db, event)
        if not party_round or party_round.id != round_id:
            raise HTTPException(409, "This challenge is no longer active")
        if db.scalar(select(ChallengeClaim).where(ChallengeClaim.round_id == round_id, ChallengeClaim.user_id == user_id)):
            raise HTTPException(409, "You already submitted this challenge")
        voters = list(db.scalars(select(Membership.user_id).where(Membership.competition_id == event_id, Membership.role == "player", Membership.user_id != user_id)))
        if not voters:
            raise HTTPException(409, "Another player must be present to validate the challenge")
        row = Submission(id=photo_id, competition_id=event_id, user_id=user_id, idempotency_key=key, kind="challenge", party_round_id=round_id, rear=paths[0], front=paths[1])
        db.add(row)
        db.flush()
        db.add(ChallengeClaim(competition_id=event_id, user_id=user_id, submission_id=row.id, round_id=round_id, prompt=party_round.prompt_key, voters=voters, approved=False))
        db.commit()
        committed = True
        return party_state(db, event, user_id)
    finally:
        if not committed:
            db.rollback()
            for path in uploaded:
                storage.remove(path)


@app.put("/competitions/{event_id}/party/attempts/{attempt_id}/vote", response_model=PartyOut)
def vote_party_attempt(event_id: str, attempt_id: str, body: VoteIn, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    member_event(db, event_id, user.id)
    event = lock_event(db, event_id)
    claim = db.get(ChallengeClaim, attempt_id)
    if not claim or claim.competition_id != event_id or not claim.round_id:
        raise HTTPException(404, "Party challenge not found")
    if event.ended_at:
        raise HTTPException(409, "Voting is closed")
    if user.id not in claim.voters:
        raise HTTPException(403, "Only the other players present at submission can vote")
    db.execute(delete(ChallengeVote).where(ChallengeVote.claim_id == claim.id, ChallengeVote.user_id == user.id))
    db.add(ChallengeVote(claim_id=claim.id, user_id=user.id, approve=body.approve))
    db.flush()
    approvals = db.scalar(select(func.count()).select_from(ChallengeVote).where(ChallengeVote.claim_id == claim.id, ChallengeVote.approve.is_(True)))
    claim.approved = approvals >= len(claim.voters) // 2 + 1
    db.commit()
    return party_state(db, event, user.id)


@app.get("/competitions/{event_id}/social", response_model=SocialOut)
def social(event_id: str, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    event = member_event(db, event_id, user.id)
    if event.mode == "battle":
        raise HTTPException(409, "Battle privacy and scoring are managed in Battle Mode")
    claims, scores = [], {}
    legacy_claims = db.execute(
        select(ChallengeClaim, Submission)
        .join(Submission, Submission.id == ChallengeClaim.submission_id)
        .where(ChallengeClaim.competition_id == event_id, ChallengeClaim.round_id.is_(None))
        .order_by(ChallengeClaim.id)
    ).all()
    totals = claim_vote_totals(db, [row[0] for row in legacy_claims], user.id)
    spectators = db.scalar(select(func.count()).select_from(Membership).where(Membership.competition_id == event_id, Membership.role == "spectator"))
    data = photo_data(db, (row[1] for row in legacy_claims), user.id)
    db.commit()
    photos, _ = render_photos(*data)
    for claim, photo in legacy_claims:
        approvals, my_vote = totals.get(claim.id, (0, None))
        required = len(claim.voters) // 2 + 1
        status = "approved" if approvals >= required else "not_approved" if event.ended_at else "pending"
        if status == "approved":
            scores[claim.user_id] = scores.get(claim.user_id, 0) + 1
        claims.append({"id": claim.id, "prompt": claim.prompt, "photo": photos[photo.id], "approvals": approvals, "required": required, "status": status, "can_vote": not event.ended_at and user.id in claim.voters, "my_vote": my_vote})
    return {"enabled": event.challenges_enabled, "spectator_code": event.spectator_code if event.host_id == user.id else None, "spectators": spectators, "prompts": PROMPTS, "claims": claims, "scores": scores}


@app.post("/competitions/{event_id}/social/enable", response_model=SocialOut)
def enable_challenges(event_id: str, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    event = member_event(db, event_id, user.id)
    if event.mode == "battle":
        raise HTTPException(409, "Social challenges are unavailable in Battle Mode")
    if event.host_id != user.id:
        raise HTTPException(403, "Only the host can enable challenges")
    event = lock_event(db, event_id)
    if event.ended_at:
        raise HTTPException(409, "This night has finished")
    event.challenges_enabled = True
    db.commit()
    return social(event_id, user, db)


@app.post("/competitions/{event_id}/spectator-invite", response_model=SocialOut)
def spectator_invite(event_id: str, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    event = member_event(db, event_id, user.id)
    if event.mode == "battle":
        raise HTTPException(409, "Spectators are unavailable in Battle Mode")
    if event.host_id != user.id:
        raise HTTPException(403, "Only the host can invite spectators")
    event = lock_event(db, event_id)
    if event.ended_at:
        raise HTTPException(409, "This night has finished")
    if not event.spectator_code:
        event.spectator_code = "VW" + secrets.token_hex(4).upper()
    db.commit()
    return social(event_id, user, db)


@app.post("/competitions/{event_id}/claims", response_model=SocialOut)
def claim_challenge(event_id: str, body: ClaimIn, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    current_event = member_event(db, event_id, user.id)
    if current_event.mode == "battle":
        raise HTTPException(409, "Social challenges are unavailable in Battle Mode")
    event = lock_event(db, event_id)
    if event.ended_at or not event.challenges_enabled:
        raise HTTPException(409, "Challenges are not open")
    if db.get(Membership, (event_id, user.id)).role != "player":
        raise HTTPException(403, "Spectators cannot submit challenges")
    photo = db.get(Submission, body.submission_id)
    if not photo or photo.competition_id != event_id or photo.user_id != user.id:
        raise HTTPException(404, "Choose one of your photos from this night")
    existing = db.scalar(select(ChallengeClaim).where(ChallengeClaim.competition_id == event_id, ChallengeClaim.user_id == user.id, ChallengeClaim.prompt == body.prompt))
    if existing:
        db.rollback()
        return social(event_id, user, db)
    voters = list(db.scalars(select(Membership.user_id).where(Membership.competition_id == event_id, Membership.role == "player", Membership.user_id != user.id)))
    if not voters:
        raise HTTPException(409, "Invite another player before claiming a challenge")
    db.add(ChallengeClaim(competition_id=event_id, user_id=user.id, submission_id=photo.id, prompt=body.prompt, voters=voters))
    db.commit()
    return social(event_id, user, db)


@app.put("/competitions/{event_id}/claims/{claim_id}/vote", response_model=SocialOut)
def vote_challenge(event_id: str, claim_id: str, body: VoteIn, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    current_event = member_event(db, event_id, user.id)
    if current_event.mode == "battle":
        raise HTTPException(409, "Social challenges are unavailable in Battle Mode")
    event = lock_event(db, event_id)
    claim = db.get(ChallengeClaim, claim_id)
    if not claim or claim.competition_id != event_id or claim.round_id is not None:
        raise HTTPException(404, "Challenge not found")
    if event.ended_at:
        raise HTTPException(409, "Voting is closed")
    if user.id not in claim.voters:
        raise HTTPException(403, "Only the other players present at submission can vote")
    db.execute(delete(ChallengeVote).where(ChallengeVote.claim_id == claim.id, ChallengeVote.user_id == user.id))
    db.add(ChallengeVote(claim_id=claim.id, user_id=user.id, approve=body.approve))
    db.commit()
    return social(event_id, user, db)


@app.websocket("/ws/competitions/{event_id}")
async def live(socket: WebSocket, event_id: str):
    await socket.accept()
    try:
        # Authenticate via first message; tokens never appear in request URLs/logs.
        message = await asyncio.wait_for(socket.receive_json(), timeout=10)
        if not isinstance(message, dict):
            raise ValueError("Expected an authentication message")
        claims = decode(message.get("token", ""), "access")
        def authorize():
            with Session() as db:
                member_event(db, event_id, claims["sub"])
        await to_thread.run_sync(authorize)
        previous = None
        last_message = 0.0
        while int(time.time()) < claims["exp"]:
            revision = await live_revision(event_id)
            now = time.monotonic()
            if revision != previous:
                await socket.send_json({"type": "changed", "revision": revision})
                previous = revision
                last_message = now
            elif now - last_message >= LIVE_HEARTBEAT_SECONDS:
                await socket.send_json({"type": "heartbeat"})
                last_message = now
            await asyncio.sleep(LIVE_REVISION_CACHE_SECONDS)
        await socket.close(code=4401)
    except (HTTPException, asyncio.TimeoutError, ValueError, KeyError, TypeError):
        with suppress(RuntimeError, WebSocketDisconnect):
            await socket.close(code=4401)
    except (WebSocketDisconnect, RuntimeError):
        pass
