"""Instrument only the disposable API started by scripts.capacity_test."""

import argparse
from contextvars import ContextVar
from dataclasses import dataclass
import json
import os
from pathlib import Path
import time

from alembic import command
from alembic.config import Config
from anyio import to_thread
from fastapi import Request
from sqlalchemy import event, func, select, text
import uvicorn

if Path(os.environ.get("CAPACITY_SANDBOX", "")).resolve() != Path.cwd() or not os.environ.get("CAPACITY_SANDBOX"):
    raise RuntimeError("Start this instrumented server through scripts.capacity_test")

from app.db import Session, engine
from app.main import app
from app.models import Competition, Membership, Reaction, Submission, User
from app.security import hasher


@dataclass
class RequestWork:
    queries: int = 0
    sql_seconds: float = 0


work = ContextVar("request_work", default=None)
pool_peak = 0


@event.listens_for(engine, "before_cursor_execute")
def start_sql(conn, cursor, statement, parameters, context, executemany):
    context.capacity_started = time.perf_counter()


@event.listens_for(engine, "after_cursor_execute")
def finish_sql(conn, cursor, statement, parameters, context, executemany):
    sample = work.get()
    if sample is not None:
        sample.queries += 1
        sample.sql_seconds += time.perf_counter() - context.capacity_started


@event.listens_for(engine.pool, "checkout")
def track_pool(*_):
    global pool_peak
    pool_peak = max(pool_peak, engine.pool.checkedout())


@app.get("/__capacity", include_in_schema=False)
async def sample_pool(request: Request):
    global pool_peak
    current = engine.pool.checkedout()
    result = {"pid": os.getpid(), "pool_peak": pool_peak, "pool_current": current}
    for name, limiter in (("general", to_thread.current_default_thread_limiter()),
                          ("auth", request.state.auth_limiter), ("upload", request.state.upload_limiter)):
        result[f"{name}_busy"] = limiter.borrowed_tokens
        result[f"{name}_queued"] = limiter.statistics().tasks_waiting
    pool_peak = current
    return result


async def measured_app(scope, receive, send):
    if scope["type"] != "http" or scope["path"] == "/__capacity":
        await app(scope, receive, send)
        return
    sample = RequestWork()
    token = work.set(sample)
    started = time.perf_counter()

    async def send_timings(message):
        if message["type"] == "http.response.start":
            message["headers"].extend([
                (b"x-capacity-service-ms", str(round((time.perf_counter() - started) * 1000, 3)).encode()),
                (b"x-capacity-sql-ms", str(round(sample.sql_seconds * 1000, 3)).encode()),
                (b"x-capacity-sql-count", str(sample.queries).encode()),
            ])
        await send(message)

    try:
        await app(scope, receive, send_timings)
    finally:
        work.reset(token)


def seed(users, history):
    backend = Path(__file__).resolve().parents[1]
    config = Config(backend / "alembic.ini")
    config.set_main_option("script_location", (backend / "migrations").as_posix())
    command.upgrade(config, "head")
    started = int(time.time())
    password_hash = hasher.hash(os.environ["CAPACITY_PASSWORD"])
    with Session.begin() as db:
        accounts = [User(username=f"capacity_{i}", password_hash=password_hash) for i in range(users + 2)]
        db.add_all(accounts)
        db.flush()
        host, *players, outsider = accounts
        active = Competition(name="Capacity night", code="CAPACITY", host_id=host.id)
        archived = [
            Competition(name=f"Archive {i}", code=f"ARC{i:05d}", host_id=host.id,
                        created_at=started - (i + 1) * 86400, ended_at=started - i * 86400 - 1)
            for i in range(history)
        ]
        private = Competition(name="Private archive", code="PRIVATE1", host_id=outsider.id, ended_at=started)
        db.add_all([active, private, *archived])
        db.flush()
        db.add_all([Membership(competition_id=active.id, user_id=host.id),
                    Membership(competition_id=private.id, user_id=outsider.id)])
        db.add_all(Membership(competition_id=night.id, user_id=user.id,
                              role="spectator" if i == 0 and user == players[0] else "player")
                   for i, night in enumerate(archived) for user in [host, *players])
        photos = [Submission(competition_id=active.id, user_id=host.id, idempotency_key=f"seed-{i}",
                             created_at=started - 3600 + i, beer_count=1, pint_count=0,
                             rear="fixture/rear.jpg", front="fixture/front.jpg") for i in range(24)]
        db.add_all(photos)
        db.flush()
        manifest = {"event": active.id, "host": host.id, "archive": [night.id for night in archived],
                    "private": private.id, "photo": photos[-1].id, "seed_photos": [p.id for p in photos]}
    Path("manifest.json").write_text(json.dumps(manifest), encoding="utf-8")


def audit(event_id):
    with Session() as db:
        rows = db.execute(select(Submission.id, Submission.user_id, Submission.beer_count, Submission.pint_count,
                                 Submission.rear, Submission.front).where(Submission.competition_id == event_id)).all()
        members = db.scalar(select(func.count()).select_from(Membership).where(Membership.competition_id == event_id))
        last = db.get(Competition, event_id)
        reactions = db.scalar(select(func.count()).select_from(Reaction).join(Submission)
                              .where(Submission.competition_id == event_id))
        pg = {}
        if engine.dialect.name == "postgresql":
            pg = dict(db.execute(text("""
                SELECT xact_commit, xact_rollback, blks_read, blks_hit, deadlocks, temp_bytes
                FROM pg_stat_database WHERE datname = current_database()
            """)).mappings().one())
    expected_paths = {path for *_, rear, front in rows for path in (rear, front)}
    upload_dir = Path("uploads")
    actual_paths = {path.relative_to(upload_dir).as_posix() for path in upload_dir.rglob("*.jpg")}
    result = {"photos": {photo: [user, quantity, pints] for photo, user, quantity, pints, _, _ in rows},
              "members": members, "revision": last.revision, "ended": bool(last.ended_at), "reactions": reactions,
              "missing_media": len(expected_paths - actual_paths), "orphan_media": len(actual_paths - expected_paths),
              "postgres": pg}
    Path("audit.json").write_text(json.dumps(result), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    seed_parser = commands.add_parser("seed")
    seed_parser.add_argument("users", type=int)
    seed_parser.add_argument("history", type=int)
    commands.add_parser("serve").add_argument("port", type=int)
    commands.add_parser("audit").add_argument("event_id")
    args = parser.parse_args()
    if args.command == "seed":
        seed(args.users, args.history)
    elif args.command == "audit":
        audit(args.event_id)
    else:
        uvicorn.run(measured_app, host="127.0.0.1", port=args.port, access_log=False, log_level="error")


if __name__ == "__main__":
    main()
