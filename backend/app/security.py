import hashlib
import secrets
import time
from threading import BoundedSemaphore
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, update
from sqlalchemy.orm import Session
from .config import settings
from .db import get_db
from .models import RefreshSession, User

hasher = PasswordHasher()
dummy_hash = hasher.hash(secrets.token_urlsafe(20))
password_slots = BoundedSemaphore(settings.password_hash_concurrency)
bearer = HTTPBearer(auto_error=False)
REFRESH_SECONDS = 30 * 86400


def digest(value: str):
    return hashlib.sha256(value.encode()).hexdigest()


def encode(subject: str, kind: str, seconds: int, **claims):
    return jwt.encode({"sub": subject, "kind": kind, "exp": int(time.time()) + seconds, **claims}, settings.jwt_secret, algorithm="HS256")


def decode(token: str, kind: str):
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], options={"require": ["exp", "sub", "kind"]})
        if payload["kind"] != kind:
            raise ValueError()
        return payload
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(401, "Session expired. Please sign in again.")


def current_user(auth: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)):
    if not auth:
        raise HTTPException(401, "Sign in to continue")
    user = db.get(User, decode(auth.credentials, "access")["sub"])
    if not user:
        raise HTTPException(401, "Account not found")
    return user


def issue_tokens(db: Session, user_id: str):
    refresh = secrets.token_urlsafe(48)
    db.add(RefreshSession(token_hash=digest(refresh), user_id=user_id, expires_at=int(time.time()) + REFRESH_SECONDS))
    return {"access_token": encode(user_id, "access", 900), "refresh_token": refresh}


def rotate(db: Session, token: str):
    # DELETE ... RETURNING atomically consumes the token, including across workers.
    row = db.execute(delete(RefreshSession).where(RefreshSession.token_hash == digest(token), RefreshSession.expires_at > int(time.time())).returning(RefreshSession.user_id)).first()
    if not row:
        raise HTTPException(401, "Session expired. Please sign in again.")
    tokens = issue_tokens(db, row[0])
    db.commit()
    return tokens


def password_matches(password, encoded):
    try:
        with password_slots:
            return hasher.verify(encoded, password)
    except VerificationError:
        return False


def hash_password(password: str):
    with password_slots:
        return hasher.hash(password)
