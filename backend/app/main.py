import asyncio
import secrets
import time
import uuid
from contextlib import suppress
from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession
from . import storage
from .db import Session, get_db
from .models import Competition, LoginAttempt, Membership, RefreshSession, Submission, User
from .schemas import CreateCompetition, Credentials, EventDetail, EventOut, JoinCompetition, PhotoOut, Profile, RefreshIn, Register, Tokens
from .security import current_user, decode, digest, dummy_hash, hasher, issue_tokens, password_matches, rotate

app = FastAPI(title="BEERREAL", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST", "PUT"], allow_headers=["Authorization", "Content-Type", "Idempotency-Key"])


def profile(user):
    return {"id": user.id, "username": user.username, "avatar_url": storage.photo_url(user.avatar)}


def event_out(db, event):
    return {"id": event.id, "name": event.name, "host_id": event.host_id, "code": event.code, "created_at": event.created_at, "ended_at": event.ended_at, "revision": event.revision, "participants": db.scalar(select(func.count()).select_from(Membership).where(Membership.competition_id == event.id))}


def member_event(db, event_id, user_id):
    event = db.get(Competition, event_id)
    if not event or not db.get(Membership, (event_id, user_id)):
        raise HTTPException(404, "Competition not found")
    return event


def lock_event(db, event_id):
    # An UPDATE acquires a write lock on SQLite and a row lock on PostgreSQL.
    # Submissions, joins, and ending always use this same lock order.
    db.execute(update(Competition).where(Competition.id == event_id).values(revision=Competition.revision + 1))
    return db.get(Competition, event_id, populate_existing=True)


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


@app.get("/health")
def health(db: DbSession = Depends(get_db)):
    db.execute(select(1))
    return {"status": "ok"}


@app.post("/auth/register", response_model=Tokens, status_code=201)
def register(body: Register, request: Request, db: DbSession = Depends(get_db)):
    throttle(db, request, body.username)
    user = User(username=body.username, password_hash=hasher.hash(body.password))
    db.add(user)
    try:
        db.flush()
        result = issue_tokens(db, user.id)
        db.commit()
        return result
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "That username is already taken")


@app.post("/auth/login", response_model=Tokens)
def login(body: Credentials, request: Request, db: DbSession = Depends(get_db)):
    throttle(db, request, body.username)
    user = db.scalar(select(User).where(User.username == body.username))
    valid = password_matches(body.password, user.password_hash if user else dummy_hash)
    if not user or not valid:
        raise HTTPException(401, "Incorrect username or password")
    tokens = issue_tokens(db, user.id)
    db.commit()
    return tokens


@app.post("/auth/refresh", response_model=Tokens)
def refresh(body: RefreshIn, db: DbSession = Depends(get_db)):
    return rotate(db, body.refresh_token)


@app.post("/auth/logout", status_code=204)
def logout(body: RefreshIn, db: DbSession = Depends(get_db)):
    db.execute(delete(RefreshSession).where(RefreshSession.token_hash == digest(body.refresh_token)))
    db.commit()


@app.get("/me", response_model=Profile)
def me(user: User = Depends(current_user)):
    return profile(user)


@app.put("/me/avatar", response_model=Profile)
def avatar(photo: UploadFile = File(), user: User = Depends(current_user), db: DbSession = Depends(get_db)):
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
    rows = db.scalars(select(Competition).join(Membership).where(Membership.user_id == user.id).order_by(Competition.created_at.desc(), Competition.id))
    return [event_out(db, row) for row in rows]


@app.post("/competitions", response_model=EventOut, status_code=201)
def create_event(body: CreateCompetition, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    for _ in range(5):
        event = Competition(name=body.name, host_id=user.id, code="".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(8)))
        try:
            db.add(event)
            db.flush()
            db.add(Membership(competition_id=event.id, user_id=user.id))
            db.commit()
            return event_out(db, event)
        except IntegrityError:
            db.rollback()
    raise HTTPException(503, "Please try creating the competition again")


@app.post("/competitions/join", response_model=EventOut)
def join(body: JoinCompetition, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    event = db.scalar(select(Competition).where(Competition.code == body.code.upper()))
    if not event:
        raise HTTPException(404, "Invitation code not found")
    event = lock_event(db, event.id)
    if db.get(Membership, (event.id, user.id)):
        db.rollback()
        return event_out(db, event)
    if event.ended_at:
        raise HTTPException(409, "This competition has finished")
    db.add(Membership(competition_id=event.id, user_id=user.id))
    db.commit()
    return event_out(db, event)


def photo_out(db, row):
    return {"id": row.id, "user": profile(db.get(User, row.user_id)), "rear_url": storage.photo_url(row.rear), "front_url": storage.photo_url(row.front), "created_at": row.created_at}


@app.get("/competitions/{event_id}", response_model=EventDetail)
def detail(event_id: str, before: str | None = None, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    event = member_event(db, event_id, user.id)
    counts = select(Submission.user_id, func.count().label("n")).where(Submission.competition_id == event_id).group_by(Submission.user_id).subquery()
    rows = db.execute(select(User, func.coalesce(counts.c.n, 0)).join(Membership, Membership.user_id == User.id).outerjoin(counts, counts.c.user_id == User.id).where(Membership.competition_id == event_id).order_by(func.coalesce(counts.c.n, 0).desc(), User.username)).all()
    standings, rank, previous = [], 0, None
    for person, count in rows:
        if count != previous:
            rank += 1
        standings.append({**profile(person), "count": count, "points": count, "rank": rank})
        previous = count
    query = select(Submission).where(Submission.competition_id == event_id)
    if before:
        cursor = db.get(Submission, before)
        if not cursor or cursor.competition_id != event_id:
            raise HTTPException(400, "Invalid feed cursor")
        query = query.where((Submission.created_at < cursor.created_at) | ((Submission.created_at == cursor.created_at) & (Submission.id < cursor.id)))
    photos = list(db.scalars(query.order_by(Submission.created_at.desc(), Submission.id.desc()).limit(21)))
    recap = []
    if event.ended_at:
        # Independent of feed pagination; deterministic ordering for timestamp ties.
        for person, count in rows:
            own = select(Submission).where(Submission.competition_id == event_id, Submission.user_id == person.id)
            first = db.scalar(own.order_by(Submission.created_at, Submission.id).limit(1)) if count else None
            last = db.scalar(own.order_by(Submission.created_at.desc(), Submission.id.desc()).limit(1)) if count > 1 else None
            recap.append({"user": profile(person), "first": photo_out(db, first) if first else None, "last": photo_out(db, last) if last else None})
    return {"competition": event_out(db, event), "standings": standings, "feed": [photo_out(db, row) for row in photos[:20]], "next_cursor": photos[19].id if len(photos) > 20 else None, "recap": recap}


@app.post("/competitions/{event_id}/submissions", response_model=PhotoOut, status_code=201)
def submit(event_id: str, rear: UploadFile = File(), front: UploadFile = File(), idempotency_key: uuid.UUID = Header(), user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    member_event(db, event_id, user.id)
    key = str(idempotency_key)
    existing_query = select(Submission).where(Submission.competition_id == event_id, Submission.user_id == user.id, Submission.idempotency_key == key)
    existing = db.scalar(existing_query)
    if existing:
        return photo_out(db, existing)
    rear_data, front_data = storage.validate_image(rear), storage.validate_image(front)
    # Finish read transaction before slow storage I/O, then lock and re-check.
    user_id = user.id
    db.rollback()
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
        if event.ended_at:
            raise HTTPException(409, "This competition has finished. Your photo was not counted.")
        row = Submission(id=photo_id, competition_id=event_id, user_id=user_id, idempotency_key=key, rear=paths[0], front=paths[1])
        db.add(row)
        db.commit()
        committed = True
        return photo_out(db, row)
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
    event = lock_event(db, event_id)
    if not event.ended_at:
        event.ended_at = int(time.time())
    db.commit()
    return event_out(db, event)


@app.get("/media", include_in_schema=False)
def media(token: str):
    key = decode(token, "photo")["sub"]
    path = storage.local_path(key)
    if not path.is_file():
        raise HTTPException(404, "Photo not found")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=60"})


@app.websocket("/ws/competitions/{event_id}")
async def live(socket: WebSocket, event_id: str):
    await socket.accept()
    try:
        # Authenticate via first message; tokens never appear in request URLs/logs.
        message = await asyncio.wait_for(socket.receive_json(), timeout=10)
        if not isinstance(message, dict):
            raise ValueError("Expected an authentication message")
        claims = decode(message.get("token", ""), "access")
        def get_revision():
            with Session() as db:
                return member_event(db, event_id, claims["sub"]).revision
        previous = None
        while int(time.time()) < claims["exp"]:
            revision = await asyncio.to_thread(get_revision)
            if revision != previous:
                await socket.send_json({"type": "changed", "revision": revision})
                previous = revision
            else:
                await socket.send_json({"type": "heartbeat"})
            await asyncio.sleep(2)
        await socket.close(code=4401)
    except (HTTPException, asyncio.TimeoutError, ValueError, KeyError, TypeError):
        with suppress(RuntimeError, WebSocketDisconnect):
            await socket.close(code=4401)
    except (WebSocketDisconnect, RuntimeError):
        pass
