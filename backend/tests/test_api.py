import io
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from urllib.parse import urlparse
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from app import storage
from app.db import Session
from app.main import app
from app.models import Competition, Submission
from app.security import encode


def account(client, name="alex"):
    response = client.post("/auth/register", json={"username": name, "password": "strong-password-123", "legal_age": True})
    assert response.status_code == 201, response.text
    tokens = response.json()
    return {"Authorization": f"Bearer {tokens['access_token']}"}, tokens


def event(client, auth):
    response = client.post("/competitions", headers=auth, json={"name": "Friday with the usuals"})
    assert response.status_code == 201, response.text
    return response.json()


def image():
    out = io.BytesIO()
    Image.new("RGB", (40, 40), "gold").save(out, "JPEG")
    return out.getvalue()


def submit(client, auth, event_id, key=None):
    return client.post(f"/competitions/{event_id}/submissions", headers={**auth, "Idempotency-Key": key or str(uuid.uuid4())}, files={side: (f"{side}.jpg", image(), "image/jpeg") for side in ("rear", "front")})


def test_registration_and_auth(client):
    auth, tokens = account(client)
    assert client.get("/me", headers=auth).json()["username"] == "alex"
    assert client.get("/me").status_code == 401
    assert client.post("/auth/register", json={"username": "ALEX", "password": "strong-password-123", "legal_age": True}).status_code == 409
    assert client.post("/auth/register", json={"username": "sam", "password": "strong-password-123", "legal_age": False}).status_code == 422
    assert client.post("/auth/login", json={"username": "alex", "password": "incorrect-password"}).status_code == 401
    assert client.post("/auth/login", json={"username": "ALEX", "password": "strong-password-123"}).status_code == 200


def test_refresh_rotation_and_logout(client):
    _, tokens = account(client)
    refreshed = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200
    assert client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401
    new_token = refreshed.json()["refresh_token"]
    assert client.post("/auth/logout", json={"refresh_token": new_token}).status_code == 204
    assert client.post("/auth/refresh", json={"refresh_token": new_token}).status_code == 401
    expired = encode("missing-user", "access", -10)
    assert client.get("/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_throttle(client):
    for _ in range(15):
        assert client.post("/auth/login", json={"username": "unknown", "password": "incorrect-password"}).status_code == 401
    assert client.post("/auth/login", json={"username": "unknown", "password": "incorrect-password"}).status_code == 429


def test_full_event_flow_and_privacy(client):
    host, _ = account(client)
    guest, _ = account(client, "sam")
    outsider, _ = account(client, "morgan")
    night = event(client, host)
    path = f"/competitions/{night['id']}"
    assert client.get(path, headers=outsider).status_code == 404
    assert submit(client, outsider, night["id"]).status_code == 404
    assert client.get("/competitions", headers=outsider).json() == []
    for _ in range(2):
        joined = client.post("/competitions/join", headers=guest, json={"code": night["code"].lower()})
        assert joined.status_code == 200
        assert joined.json()["participants"] == 2
    initial = client.get(path, headers=host).json()
    assert all(row["count"] == 0 and row["rank"] == 1 for row in initial["standings"])
    assert client.post(path + "/end", headers=guest).status_code == 403
    key = str(uuid.uuid4())
    first = submit(client, host, night["id"], key)
    assert first.status_code == 201, first.text
    assert submit(client, host, night["id"], key).json()["id"] == first.json()["id"]
    photo_url = urlparse(first.json()["rear_url"])
    assert client.get(photo_url.path + "?" + photo_url.query).status_code == 200
    assert client.get("/media?token=invalid").status_code == 401
    assert submit(client, guest, night["id"]).status_code == 201
    tied = client.get(path, headers=host).json()
    assert [r["rank"] for r in tied["standings"]] == [1, 1]
    assert len(tied["feed"]) == 2
    assert client.post(path + "/end", headers=host).status_code == 200
    assert submit(client, host, night["id"]).status_code == 409
    assert submit(client, host, night["id"], key).json()["id"] == first.json()["id"]
    assert client.post("/competitions/join", headers=outsider, json={"code": night["code"]}).status_code == 409
    final = client.get(path, headers=guest).json()
    assert final["competition"]["ended_at"]
    assert len(final["feed"]) == 2


def test_invalid_photo_and_missing_pair(client):
    host, _ = account(client)
    night = event(client, host)
    path = f"/competitions/{night['id']}/submissions"
    headers = {**host, "Idempotency-Key": str(uuid.uuid4())}
    assert client.post(path, headers=headers, files={"rear": ("photo.jpg", image(), "image/jpeg")}).status_code == 422
    response = client.post(path, headers=headers, files={"rear": ("photo.jpg", b"not a photo", "image/jpeg"), "front": ("photo.jpg", image(), "image/jpeg")})
    assert response.status_code == 422
    assert client.get(f"/competitions/{night['id']}", headers=host).json()["standings"][0]["count"] == 0


def test_storage_failure_does_not_score(client, monkeypatch):
    host, _ = account(client)
    night = event(client, host)
    original = storage.put
    paths = []
    def broken(key, data):
        paths.append(key)
        if key.endswith("front.jpg"):
            raise HTTPException(503, "storage offline")
        original(key, data)
    monkeypatch.setattr(storage, "put", broken)
    key = str(uuid.uuid4())
    assert submit(client, host, night["id"], key).status_code == 503
    assert all(not storage.local_path(path).exists() for path in paths)
    assert client.get(f"/competitions/{night['id']}", headers=host).json()["standings"][0]["count"] == 0
    monkeypatch.setattr(storage, "put", original)
    assert submit(client, host, night["id"], key).status_code == 201


def test_concurrent_duplicate_submissions(client):
    host, _ = account(client)
    night = event(client, host)
    key = str(uuid.uuid4())
    barrier = Barrier(2)
    def work():
        with TestClient(app) as other:
            barrier.wait()
            return submit(other, host, night["id"], key)
    with ThreadPoolExecutor(2) as pool:
        futures = [pool.submit(work) for _ in range(2)]
        responses = [f.result() for f in futures]
    assert all(r.status_code == 201 for r in responses), [r.text for r in responses]
    assert responses[0].json()["id"] == responses[1].json()["id"]
    assert client.get(f"/competitions/{night['id']}", headers=host).json()["standings"][0]["count"] == 1


def test_end_during_upload(client, monkeypatch):
    host, _ = account(client)
    night = event(client, host)
    original = storage.put
    def end_after_upload(key, data):
        original(key, data)
        if key.endswith("front.jpg"):
            with TestClient(app) as other:
                assert other.post(f"/competitions/{night['id']}/end", headers=host).status_code == 200
    monkeypatch.setattr(storage, "put", end_after_upload)
    assert submit(client, host, night["id"]).status_code == 409
    with Session() as db:
        assert not list(db.scalars(select(Submission)))


def test_websocket_membership_and_revision(client):
    host, tokens = account(client)
    _, outsider = account(client, "sam")
    night = event(client, host)
    with client.websocket_connect(f"/ws/competitions/{night['id']}") as ws:
        ws.send_json({"token": tokens["access_token"]})
        assert ws.receive_json()["type"] == "changed"
        assert client.post(f"/competitions/{night['id']}/end", headers=host).status_code == 200
        assert ws.receive_json()["type"] == "changed"
    with client.websocket_connect(f"/ws/competitions/{night['id']}") as ws:
        ws.send_json({"token": outsider["access_token"]})
        assert ws.receive()["code"] == 4401


def test_avatar_and_signed_link_expiry(client):
    auth, _ = account(client)
    result = client.put("/me/avatar", headers=auth, files={"photo": ("avatar.jpg", image(), "image/jpeg")})
    assert result.status_code == 200
    assert result.json()["avatar_url"]
    token = encode("anything.jpg", "photo", -1)
    assert client.get("/media", params={"token": token}).status_code == 401
    assert client.get("/media", params={"token": encode("../outside", "photo", 60)}).status_code == 403


def test_dense_rank_groups_and_pagination(client):
    host, _ = account(client)
    night = event(client, host)
    with Session() as db:
        user_id = db.get(Competition, night["id"]).host_id
        for i in range(22):
            db.add(Submission(competition_id=night["id"], user_id=user_id, idempotency_key=str(uuid.uuid4()), rear="test.jpg", front="test.jpg", created_at=1000 + i))
        db.commit()
    first = client.get(f"/competitions/{night['id']}", headers=host).json()
    assert len(first["feed"]) == 20
    second = client.get(f"/competitions/{night['id']}?before={first['next_cursor']}", headers=host).json()
    assert len(second["feed"]) == 2
    assert second["next_cursor"] is None
    assert not set(p["id"] for p in first["feed"]) & set(p["id"] for p in second["feed"])
