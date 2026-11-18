import time
import uuid
from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint, JSON, false
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


def uid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    username: Mapped[str] = mapped_column(String(24), unique=True)
    password_hash: Mapped[str]
    avatar: Mapped[str | None]
    age_attested_at: Mapped[int] = mapped_column(default=lambda: int(time.time()))


class Competition(Base):
    __tablename__ = "competitions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(60))
    host_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    code: Mapped[str] = mapped_column(String(10), unique=True)
    created_at: Mapped[int] = mapped_column(default=lambda: int(time.time()))
    ended_at: Mapped[int | None]
    revision: Mapped[int] = mapped_column(default=0)
    mode: Mapped[str] = mapped_column(String(16), default="classic", server_default="classic")
    party_started_at: Mapped[int | None]
    spectator_code: Mapped[str | None] = mapped_column(String(10), unique=True, index=True)
    challenges_enabled: Mapped[bool] = mapped_column(default=False, server_default=false())


class Membership(Base):
    __tablename__ = "memberships"
    competition_id: Mapped[str] = mapped_column(ForeignKey("competitions.id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(16), default="player", server_default="player")


class PartyRound(Base):
    __tablename__ = "party_rounds"
    __table_args__ = (
        UniqueConstraint("competition_id", "sequence"),
        UniqueConstraint("competition_id", "prompt_key"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    competition_id: Mapped[str] = mapped_column(ForeignKey("competitions.id"), index=True)
    sequence: Mapped[int]
    prompt_key: Mapped[str] = mapped_column(String(40))
    prompt: Mapped[str] = mapped_column(String(160))
    starts_at: Mapped[int]
    ends_at: Mapped[int]


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (
        UniqueConstraint("competition_id", "user_id", "idempotency_key"),
        CheckConstraint("pint_count >= 0 AND pint_count <= beer_count", name="valid_pint_count"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    competition_id: Mapped[str] = mapped_column(ForeignKey("competitions.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    idempotency_key: Mapped[str] = mapped_column(String(36))
    kind: Mapped[str] = mapped_column(String(16), default="drink", server_default="drink")
    party_round_id: Mapped[str | None] = mapped_column(ForeignKey("party_rounds.id"), index=True)
    beer_count: Mapped[int] = mapped_column(default=1, server_default="1")
    pint_count: Mapped[int] = mapped_column(default=0, server_default="0")
    rear: Mapped[str]
    front: Mapped[str]
    created_at: Mapped[int] = mapped_column(default=lambda: int(time.time()))


class RefreshSession(Base):
    __tablename__ = "refresh_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[int]


class Reaction(Base):
    __tablename__ = "reactions"
    submission_id: Mapped[str] = mapped_column(ForeignKey("submissions.id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    emoji: Mapped[str] = mapped_column(String(16))


class ChallengeClaim(Base):
    __tablename__ = "challenge_claims"
    __table_args__ = (UniqueConstraint("competition_id", "user_id", "prompt"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    competition_id: Mapped[str] = mapped_column(ForeignKey("competitions.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    submission_id: Mapped[str] = mapped_column(ForeignKey("submissions.id"))
    round_id: Mapped[str | None] = mapped_column(ForeignKey("party_rounds.id"), index=True)
    prompt: Mapped[str] = mapped_column(String(30))
    voters: Mapped[list[str]] = mapped_column(JSON)
    approved: Mapped[bool] = mapped_column(default=False, server_default=false())


class ChallengeVote(Base):
    __tablename__ = "challenge_votes"
    claim_id: Mapped[str] = mapped_column(ForeignKey("challenge_claims.id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    approve: Mapped[bool]


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    count: Mapped[int] = mapped_column(default=0)
    window: Mapped[int]
