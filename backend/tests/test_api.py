import io
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event
from urllib.parse import urlparse
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import event as sqlalchemy_event, select
from app import storage
from app.db import Session, engine
from app.main import UPLOAD_CONCURRENCY, app
from app.models import Competition, PartyRound, Submission, User
from app.security import encode

WEB_ORIGIN = "http://localhost:8082"


def account(client, name="alex"):
    response = client.post("/auth/register", json={"username": name, "password": "strong-password-123", "legal_age": True})
    assert response.status_code == 201, response.text
    tokens = response.json()
    return {"Authorization": f"Bearer {tokens['access_token']}"}, tokens


def event(client, auth, mode="classic"):
    response = client.post("/competitions", headers=auth, json={"name": "Friday with the usuals", "mode": mode})
    assert response.status_code == 201, response.text
    return response.json()


def image():
    out = io.BytesIO()
    Image.new("RGB", (40, 40), "gold").save(out, "JPEG")
    return out.getvalue()


def submit(client, auth, event_id, key=None, beer_count=1, pint_count=0):
    return client.post(
        f"/competitions/{event_id}/submissions",
        headers={**auth, "Idempotency-Key": key or str(uuid.uuid4())},
        data={"beer_count": str(beer_count), "pint_count": str(pint_count)},
        files={side: (f"{side}.jpg", image(), "image/jpeg") for side in ("rear", "front")},
    )


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


def test_web_session_cookie_rotation_and_logout(client):
    registration = client.post(
        "/auth/web/register",
        headers={"Origin": WEB_ORIGIN},
        json={"username": "web_user", "password": "strong-password-123", "legal_age": True},
    )
    assert registration.status_code == 201, registration.text
    assert set(registration.json()) == {"access_token"}
    cookie_header = registration.headers["set-cookie"]
    assert "beerreal_refresh=" in cookie_header
    assert "HttpOnly" in cookie_header
    assert "SameSite=lax" in cookie_header
    assert "Max-Age=2592000" in cookie_header
    first_refresh = registration.cookies["beerreal_refresh"]

    refreshed = client.post("/auth/web/refresh", headers={"Origin": WEB_ORIGIN})
    assert refreshed.status_code == 200, refreshed.text
    assert set(refreshed.json()) == {"access_token"}
    assert refreshed.cookies["beerreal_refresh"] != first_refresh

    client.cookies.set("beerreal_refresh", first_refresh)
    reused = client.post("/auth/web/refresh", headers={"Origin": WEB_ORIGIN})
    assert reused.status_code == 401
    assert "Max-Age=0" in reused.headers["set-cookie"]

    login = client.post(
        "/auth/web/login",
        headers={"Origin": WEB_ORIGIN},
        json={"username": "web_user", "password": "strong-password-123"},
    )
    assert login.status_code == 200, login.text
    assert client.post("/auth/web/logout", headers={"Origin": WEB_ORIGIN}).status_code == 204
    assert client.post("/auth/web/refresh", headers={"Origin": WEB_ORIGIN}).status_code == 401


def test_web_session_rejects_untrusted_origins_and_uses_secure_cookie(client, monkeypatch):
    credentials = {"username": "alex", "password": "strong-password-123"}
    account(client)
    assert client.post("/auth/web/login", json=credentials).status_code == 403
    assert client.post("/auth/web/login", headers={"Origin": "https://evil.example"}, json=credentials).status_code == 403

    monkeypatch.setattr("app.main.settings.public_url", "https://beerreal-api.onrender.com")
    trusted = client.post("/auth/web/login", headers={"Origin": WEB_ORIGIN}, json=credentials)
    assert trusted.status_code == 200, trusted.text
    assert "Secure" in trusted.headers["set-cookie"]


def test_throttle(client):
    for _ in range(15):
        assert client.post("/auth/login", json={"username": "unknown", "password": "incorrect-password"}).status_code == 401
    assert client.post("/auth/login", json={"username": "unknown", "password": "incorrect-password"}).status_code == 429


def test_host_can_change_night_name(client):
    with Session() as db:
        users = [User(username=name, password_hash="unused") for name in ("alex", "sam", "morgan")]
        db.add_all(users)
        db.commit()
        host, guest, outsider = [
            {"Authorization": f"Bearer {encode(user.id, 'access', 900)}"}
            for user in users
        ]
    night = event(client, host)
    path = f"/competitions/{night['id']}"
    client.post("/competitions/join", headers=guest, json={"code": night["code"]})
    previous_revision = client.get(path, headers=host).json()["competition"]["revision"]

    renamed = client.put(path, headers=host, json={"name": "  Saturday celebration  "})
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["name"] == "Saturday celebration"
    assert renamed.json()["revision"] == previous_revision + 1
    assert client.get(path, headers=guest).json()["competition"]["name"] == "Saturday celebration"

    assert client.put(path, headers=guest, json={"name": "Guest rename"}).status_code == 403
    assert client.put(path, headers=outsider, json={"name": "Outsider rename"}).status_code == 404
    assert client.put(path, headers=host, json={"name": "   "}).status_code == 422
    assert client.put(path, headers=host, json={"name": "x" * 61}).status_code == 422
    assert client.get(path, headers=host).json()["competition"]["name"] == "Saturday celebration"


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
    response = client.post(path, headers=headers, data={"beer_count": "2", "pint_count": "2"}, files={"rear": ("photo.jpg", b"not a photo", "image/jpeg"), "front": ("photo.jpg", image(), "image/jpeg")})
    assert response.status_code == 422
    assert client.get(f"/competitions/{night['id']}", headers=host).json()["standings"][0]["count"] == 0
    assert client.get(f"/competitions/{night['id']}", headers=host).json()["standings"][0]["points"] == 0


def test_beer_count_is_saved_summed_and_validated(client):
    host, _ = account(client)
    night = event(client, host)
    path = f"/competitions/{night['id']}"

    first = submit(client, host, night["id"], beer_count=3)
    second = submit(client, host, night["id"], beer_count=2)

    assert first.status_code == 201 and first.json()["beer_count"] == 3
    assert second.status_code == 201 and second.json()["beer_count"] == 2
    detail = client.get(path, headers=host).json()
    assert detail["standings"][0]["count"] == 5
    assert detail["standings"][0]["points"] == 5
    assert sorted(photo["beer_count"] for photo in detail["feed"]) == [2, 3]

    assert submit(client, host, night["id"], beer_count=0).status_code == 422
    assert submit(client, host, night["id"], beer_count=11).status_code == 422
    assert client.get(path, headers=host).json()["standings"][0]["count"] == 5


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
    assert submit(client, host, night["id"], key, pint_count=1).status_code == 503
    assert all(not storage.local_path(path).exists() for path in paths)
    assert client.get(f"/competitions/{night['id']}", headers=host).json()["standings"][0]["count"] == 0
    assert client.get(f"/competitions/{night['id']}", headers=host).json()["standings"][0]["points"] == 0
    monkeypatch.setattr(storage, "put", original)
    assert submit(client, host, night["id"], key, pint_count=1).status_code == 201


def test_game_reads_continue_while_photo_workers_are_busy(client, monkeypatch):
    host, _ = account(client)
    night = event(client, host)
    workers = UPLOAD_CONCURRENCY
    started = Barrier(workers + 1)
    release = Event()
    original_put = storage.put

    def paused_put(key, data):
        if key.endswith("rear.jpg"):
            started.wait(timeout=10)
            assert release.wait(timeout=10)
        original_put(key, data)

    monkeypatch.setattr(storage, "put", paused_put)
    with ThreadPoolExecutor(workers + 1) as pool:
        uploads = [pool.submit(submit, client, host, night["id"]) for _ in range(workers)]
        try:
            started.wait(timeout=10)
            detail = pool.submit(client.get, f"/competitions/{night['id']}", headers=host).result(timeout=5)
            assert detail.status_code == 200
            assert detail.json()["standings"][0]["points"] == 0
        finally:
            release.set()
        assert all(upload.result().status_code == 201 for upload in uploads)
    detail = client.get(f"/competitions/{night['id']}", headers=host)
    assert detail.json()["standings"][0]["points"] == workers


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
    assert submit(client, host, night["id"], pint_count=1).status_code == 409
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
    assert first["recap"] == []
    guest, _ = account(client, "recap_guest")
    empty, _ = account(client, "recap_empty")
    outsider, _ = account(client, "recap_outsider")
    for auth in (guest, empty):
        assert client.post("/competitions/join", headers=auth, json={"code": night["code"]}).status_code == 200
    only = submit(client, guest, night["id"]).json()
    client.post(f"/competitions/{night['id']}/end", headers=host)
    recap = client.get(f"/competitions/{night['id']}", headers=host).json()["recap"]
    by_name = {item["user"]["username"]: item for item in recap}
    assert by_name["alex"]["first"]["created_at"] == 1000
    assert by_name["alex"]["last"]["created_at"] == 1021
    assert by_name["recap_guest"]["first"]["id"] == only["id"]
    assert by_name["recap_guest"]["last"] is None
    assert by_name["recap_empty"]["first"] is None
    assert by_name["recap_empty"]["last"] is None
    paged = client.get(f"/competitions/{night['id']}?before={first['next_cursor']}", headers=host).json()
    assert [item["first"]["id"] if item["first"] else None for item in paged["recap"]] == [item["first"]["id"] if item["first"] else None for item in recap]
    assert client.get(f"/competitions/{night['id']}", headers=outsider).status_code == 404


def test_reactions_and_player_filter(client):
    host, _ = account(client)
    guest, _ = account(client, "guest")
    outsider, _ = account(client, "outsider")
    night = event(client, host)
    path = f"/competitions/{night['id']}"
    client.post("/competitions/join", headers=guest, json={"code": night["code"]})
    photo = submit(client, host, night["id"]).json()
    guest_photo = submit(client, guest, night["id"]).json()
    reaction_path = path + f"/photos/{photo['id']}/reaction"
    assert client.put(reaction_path, headers=outsider, json={"emoji": "❤️"}).status_code == 404
    for _ in range(2):
        response = client.put(reaction_path, headers=guest, json={"emoji": "❤️"})
        assert response.json()["reactions"] == {"❤️": 1}
    assert client.put(reaction_path, headers=guest, json={"emoji": "🔥"}).json()["reactions"] == {"🔥": 1}
    visible_photo = next(p for p in client.get(path, headers=guest).json()["feed"] if p["id"] == photo["id"])
    assert visible_photo["my_reaction"] == "🔥"
    assert client.put(reaction_path, headers=guest, json={"emoji": None}).json()["reactions"] == {}
    assert client.put(reaction_path, headers=guest, json={"emoji": "invalid"}).status_code == 422
    filtered = client.get(path, headers=host, params={"player": guest_photo["user"]["id"]}).json()
    assert [p["id"] for p in filtered["feed"]] == [guest_photo["id"]]
    assert all(p["count"] == 1 for p in filtered["standings"])


def test_competition_history_batches_roles_and_player_counts(client):
    host, _ = account(client)
    guest, _ = account(client, "history_guest")
    nights = [event(client, host) for _ in range(6)]
    by_id = {night["id"]: night for night in nights}
    for night in nights[:3]:
        assert client.post("/competitions/join", headers=guest, json={"code": night["code"]}).status_code == 200
    watched_id = nights[3]["id"]
    invitation = client.post(f"/competitions/{watched_id}/spectator-invite", headers=host).json()
    assert client.post("/competitions/join", headers=guest, json={"code": invitation["spectator_code"]}).status_code == 200
    assert client.post(f"/competitions/{watched_id}/end", headers=host).status_code == 200

    queries = []

    def record_select(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            queries.append(statement)

    sqlalchemy_event.listen(engine, "before_cursor_execute", record_select)
    try:
        response = client.get("/competitions", headers=guest)
    finally:
        sqlalchemy_event.remove(engine, "before_cursor_execute", record_select)

    assert response.status_code == 200
    result = response.json()
    visible = nights[:4]
    assert [night["id"] for night in result] == [night["id"] for night in sorted(visible, key=lambda night: (-night["created_at"], night["id"]))]
    for night in result:
        if night["id"] == watched_id:
            assert night["my_role"] == "spectator" and night["code"] == "" and night["participants"] == 1 and night["ended_at"]
        else:
            assert night["my_role"] == "player" and night["code"] == by_id[night["id"]]["code"] and night["participants"] == 2
    assert len(queries) <= 2


def test_challenges_and_spectators(client):
    host, _ = account(client)
    guest, _ = account(client, "guest")
    third, _ = account(client, "third")
    watcher, _ = account(client, "watcher")
    outsider, _ = account(client, "outsider")
    night = event(client, host)
    path = f"/competitions/{night['id']}"
    for auth in (guest, third):
        client.post("/competitions/join", headers=auth, json={"code": night["code"]})
    assert client.post(path + "/social/enable", headers=guest).status_code == 403
    assert client.post(path + "/spectator-invite", headers=guest).status_code == 403
    code = client.post(path + "/spectator-invite", headers=host).json()["spectator_code"]
    joined = client.post("/competitions/join", headers=watcher, json={"code": code}).json()
    assert joined["my_role"] == "spectator" and joined["code"] == "" and joined["participants"] == 3
    # Rejoining with a participant code never silently broadens a spectator's role.
    assert client.post("/competitions/join", headers=watcher, json={"code": night["code"]}).json()["my_role"] == "spectator"
    assert submit(client, watcher, night["id"]).status_code == 403
    assert client.get(path, headers=watcher).status_code == 200
    assert len(client.get(path, headers=watcher).json()["standings"]) == 3
    assert client.get(path + "/social", headers=watcher).json()["spectator_code"] is None
    assert client.get(path + "/social", headers=outsider).status_code == 404
    photo = submit(client, host, night["id"]).json()
    body = {"prompt": "yellow", "submission_id": photo["id"]}
    assert client.post(path + "/claims", headers=host, json=body).status_code == 409
    client.post(path + "/social/enable", headers=host)
    assert client.post(path + "/claims", headers=watcher, json=body).status_code == 403
    assert client.post(path + "/claims", headers=guest, json=body).status_code == 404
    for _ in range(2):
        result = client.post(path + "/claims", headers=host, json=body).json()
        assert len(result["claims"]) == 1
    claim = result["claims"][0]
    assert claim["required"] == 2 and claim["status"] == "pending"
    vote_path = path + f"/claims/{claim['id']}/vote"
    for auth in (host, watcher):
        assert client.put(vote_path, headers=auth, json={"approve": True}).status_code == 403
    for _ in range(2):
        assert client.put(vote_path, headers=guest, json={"approve": True}).json()["claims"][0]["approvals"] == 1
    approved = client.put(vote_path, headers=third, json={"approve": True}).json()
    assert approved["scores"][photo["user"]["id"]] == 1
    assert client.put(vote_path, headers=third, json={"approve": False}).json()["scores"] == {}
    client.post(path + "/end", headers=host)
    assert client.put(vote_path, headers=third, json={"approve": True}).status_code == 409
    assert client.post(path + "/claims", headers=host, json=body).status_code == 409
    assert client.get(path + "/social", headers=watcher).json()["claims"][0]["status"] == "not_approved"
    assert client.post("/competitions/join", headers=outsider, json={"code": code}).status_code == 409


def test_party_mode_rounds_attempts_and_combined_score(client, monkeypatch):
    import importlib
    main_module = importlib.import_module("app.main")
    host, _ = account(client)
    guest, _ = account(client, "party_guest")
    assert client.post("/competitions", headers=host, json={"name": "Missing mode"}).status_code == 422
    assert client.post("/competitions", headers=host, json={"name": "Bad mode", "mode": "arcade"}).status_code == 422
    classic = event(client, host)
    assert client.get(f"/competitions/{classic['id']}/party", headers=host).status_code == 409
    night = event(client, host, "party")
    path = f"/competitions/{night['id']}"
    assert night["mode"] == "party" and night["party_started_at"] is None
    assert client.post(path + "/party/start", headers=host).status_code == 409
    client.post("/competitions/join", headers=guest, json={"code": night["code"]})
    assert client.post(path + "/party/start", headers=guest).status_code == 403
    started_at = int(time.time())
    monkeypatch.setattr(main_module.time, "time", lambda: started_at)
    party = client.post(path + "/party/start", headers=host).json()
    assert party["status"] == "active"
    assert len(party["rounds"]) == 1
    assert party["active_round"]["starts_at"] == started_at
    assert party["active_round"]["ends_at"] == started_at + 1800
    with Session() as db:
        assert len(list(db.scalars(select(PartyRound).where(PartyRound.competition_id == night["id"])))) == 16
    round_id = party["active_round"]["id"]
    key = str(uuid.uuid4())
    response = client.post(
        path + f"/party/rounds/{round_id}/attempts",
        headers={**host, "Idempotency-Key": key},
        files={side: (f"{side}.jpg", image(), "image/jpeg") for side in ("rear", "front")},
    )
    assert response.status_code == 201, response.text
    attempt = response.json()["attempts"][0]
    assert attempt["status"] == "pending" and attempt["required"] == 1
    assert not client.get(path + "/social", headers=guest).json()["claims"]
    legacy_vote = client.put(path + f"/claims/{attempt['id']}/vote", headers=guest, json={"approve": True})
    assert legacy_vote.status_code == 404
    before_vote = client.get(path, headers=host).json()
    assert before_vote["standings"][0]["points"] == 0 and before_vote["feed"] == []
    approved = client.put(path + f"/party/attempts/{attempt['id']}/vote", headers=guest, json={"approve": True}).json()
    assert approved["scores"] == {before_vote["standings"][0]["id"]: 2}
    detail = client.get(path, headers=host).json()
    host_row = next(row for row in detail["standings"] if row["id"] == before_vote["standings"][0]["id"])
    assert host_row["count"] == 0 and host_row["challenge_points"] == 2 and host_row["points"] == 2
    assert detail["feed"][0]["kind"] == "challenge"
    client.put(path + f"/party/attempts/{attempt['id']}/vote", headers=guest, json={"approve": False})
    revoked = client.get(path, headers=host).json()
    assert next(row for row in revoked["standings"] if row["id"] == host_row["id"])["points"] == 0
    assert revoked["feed"] == []
    client.put(path + f"/party/attempts/{attempt['id']}/vote", headers=guest, json={"approve": True})
    monkeypatch.setattr(main_module.time, "time", lambda: started_at + 1801)
    next_party = client.get(path + "/party", headers=host).json()
    assert next_party["active_round"]["id"] != round_id and len(next_party["rounds"]) == 2
    expired = client.post(
        path + f"/party/rounds/{round_id}/attempts",
        headers={**guest, "Idempotency-Key": str(uuid.uuid4())},
        files={side: (f"{side}.jpg", image(), "image/jpeg") for side in ("rear", "front")},
    )
    assert expired.status_code == 409
    drink = submit(client, host, night["id"])
    assert drink.status_code == 201
    assert client.post(path + "/end", headers=host).status_code == 200
    closed = client.get(path, headers=host).json()
    assert any(photo["kind"] == "challenge" for photo in closed["feed"])
    moments = next(entry for entry in closed["recap"] if entry["user"]["id"] == host_row["id"])
    assert moments["first"]["id"] == drink.json()["id"]
    assert moments["last"] is None


@pytest.mark.parametrize("quantity,pints,points", [(1, 0, 1), (1, 1, 2), (5, 2, 7), (10, 10, 20)])
def test_beer_categories(client, quantity, pints, points):
    host, _ = account(client)
    night = event(client, host)
    photo = submit(client, host, night["id"], beer_count=quantity, pint_count=pints)
    assert photo.status_code == 201
    assert (photo.json()["beer_count"], photo.json()["pint_count"], photo.json()["beer_points"]) == (quantity, pints, points)
    row = client.get(f"/competitions/{night['id']}", headers=host).json()["standings"][0]
    assert (row["count"], row["points"]) == (quantity, points)


def test_points_ranking_and_independent_count(client):
    host, _ = account(client)
    night = event(client, host)
    players = [host]
    for name in ("pints", "mixed", "empty"):
        auth, _ = account(client, name)
        client.post("/competitions/join", headers=auth, json={"code": night["code"]})
        players.append(auth)
    submit(client, host, night["id"], beer_count=3)
    submit(client, host, night["id"], beer_count=2, pint_count=2)
    submit(client, players[1], night["id"], beer_count=4, pint_count=4)
    submit(client, players[2], night["id"], beer_count=7)
    rows = client.get(f"/competitions/{night['id']}", headers=host).json()["standings"]
    assert [(r["username"], r["count"], r["points"], r["rank"]) for r in rows] == [
        ("pints", 4, 8, 1), ("alex", 5, 7, 2), ("mixed", 7, 7, 2), ("empty", 0, 0, 3)]


@pytest.mark.parametrize("pints", [-1, 3, 11, "invalid", "1.5"])
def test_invalid_pint_quantity_does_not_score(client, pints):
    host, _ = account(client)
    night = event(client, host)
    assert submit(client, host, night["id"], beer_count=2, pint_count=pints).status_code == 422
    row = client.get(f"/competitions/{night['id']}", headers=host).json()["standings"][0]
    assert row["count"] == row["points"] == 0


@pytest.mark.parametrize("duplicate", [True, False])
def test_concurrent_pints_and_retries(client, duplicate):
    host, _ = account(client)
    night = event(client, host)
    key = str(uuid.uuid4())
    barrier = Barrier(2)
    def work(i):
        with TestClient(app) as other:
            barrier.wait()
            return submit(other, host, night["id"], key if duplicate or i == 0 else str(uuid.uuid4()), beer_count=5, pint_count=2)
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(work, range(2)))
    assert all(r.status_code == 201 for r in responses)
    assert (responses[0].json()["id"] == responses[1].json()["id"]) == duplicate
    # Changing quantities on retry must never replace an accepted submission.
    retry = submit(client, host, night["id"], key, beer_count=10, pint_count=10)
    assert retry.json()["beer_points"] == 7
    client.post(f"/competitions/{night['id']}/end", headers=host)
    assert submit(client, host, night["id"], beer_count=1, pint_count=1).status_code == 409
    assert submit(client, host, night["id"], key).json()["beer_points"] == 7
    row = client.get(f"/competitions/{night['id']}", headers=host).json()["standings"][0]
    factor = 1 if duplicate else 2
    assert (row["count"], row["points"]) == (5 * factor, 7 * factor)


def test_legacy_submission_defaults_to_regular(client):
    host, _ = account(client)
    night = event(client, host)
    response = client.post(f"/competitions/{night['id']}/submissions", headers={**host, "Idempotency-Key": str(uuid.uuid4())}, data={"beer_count": "3"}, files={side: (f"{side}.jpg", image(), "image/jpeg") for side in ("rear", "front")})
    assert response.status_code == 201
    assert response.json()["pint_count"] == 0
    assert response.json()["beer_points"] == 3


def create_battle(client, auth, *, visible=False, duration=600):
    response = client.post(
        "/competitions",
        headers=auth,
        json={
            "name": "Pens vs Balloons",
            "mode": "battle",
            "battle_duration_seconds": duration,
            "battle_points_visible": visible,
            "battle_team_a_name": "Pens",
            "battle_team_b_name": "Balloons",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def choose_team(client, auth, battle_id, team):
    return client.put(f"/competitions/{battle_id}/battle/team", headers=auth, json={"team": team})


def test_battle_requires_valid_setup_and_lobby_rules(client, monkeypatch):
    import importlib
    main_module = importlib.import_module("app.main")
    host, _ = account(client)
    guest, _ = account(client, "battle_guest")
    late, _ = account(client, "battle_late")
    invalid = {
        "name": "Bad battle",
        "mode": "battle",
        "battle_duration_seconds": 1200,
        "battle_points_visible": False,
        "battle_team_a_name": "Same",
        "battle_team_b_name": "Same",
    }
    assert client.post("/competitions", headers=host, json=invalid).status_code == 422
    battle = create_battle(client, host)
    path = f"/competitions/{battle['id']}"
    assert battle["mode"] == "battle" and battle["battle_started_at"] is None
    assert submit(client, host, battle["id"]).status_code == 409
    client.post("/competitions/join", headers=guest, json={"code": battle["code"]})
    assert client.post(path + "/battle/start", headers=guest).status_code == 403
    assert choose_team(client, host, battle["id"], "a").status_code == 200
    choose_team(client, guest, battle["id"], "b")
    waiting = client.get(path + "/battle", headers=host).json()
    assert waiting["can_start"] is True
    started_at = int(time.time())
    monkeypatch.setattr(main_module.time, "time", lambda: started_at)
    started = client.post(path + "/battle/start", headers=host)
    assert started.status_code == 200 and started.json()["status"] == "active"
    assert started.json()["ends_at"] == started_at + 600
    assert choose_team(client, guest, battle["id"], "a").status_code == 409
    assert client.post(path + "/battle/leave", headers=guest).status_code == 409
    assert client.post("/competitions/join", headers=late, json={"code": battle["code"]}).status_code == 409
    assert client.post(path + "/end", headers=host).status_code == 409


def test_private_battle_hides_opponent_until_timer_ends(client, monkeypatch):
    import importlib
    main_module = importlib.import_module("app.main")
    host, _ = account(client)
    guest, _ = account(client, "private_guest")
    fellow, _ = account(client, "private_fellow")
    battle = create_battle(client, host, visible=False)
    path = f"/competitions/{battle['id']}"
    for player in (guest, fellow):
        assert client.post("/competitions/join", headers=player, json={"code": battle["code"]}).status_code == 200
        assert choose_team(client, player, battle["id"], "b").status_code == 200
    assert client.get(path + "/social", headers=host).status_code == 409
    assert client.post(path + "/social/enable", headers=host).status_code == 409
    choose_team(client, host, battle["id"], "a")
    started_at = int(time.time())
    monkeypatch.setattr(main_module.time, "time", lambda: started_at)
    client.post(path + "/battle/start", headers=host)
    host_photo = submit(client, host, battle["id"], beer_count=2, pint_count=1).json()
    guest_photo = submit(client, guest, battle["id"], beer_count=1).json()

    host_view = client.get(path, headers=host).json()
    assert [photo["id"] for photo in host_view["feed"]] == [host_photo["id"]]
    assert [row["username"] for row in host_view["standings"]] == ["alex"]
    teams = {team["key"]: team for team in host_view["battle"]["teams"]}
    assert teams["a"]["score"] == 3
    assert teams["b"]["score"] is None
    opponents = teams["b"]["members"]
    assert [member["username"] for member in opponents] == ["private_fellow", "private_guest"]
    assert all(
        member["count"] is None and member["points"] is None and member["rank"] is None
        for member in opponents
    )
    own_team = client.get(path + "/battle", headers=guest).json()["teams"][1]
    ranked_members = [("private_guest", 1), ("private_fellow", 2)]
    assert [(member["username"], member["rank"]) for member in own_team["members"]] == ranked_members
    assert client.put(path + f"/photos/{guest_photo['id']}/reaction", headers=host, json={"emoji": "🔥"}).status_code == 404

    monkeypatch.setattr(main_module.time, "time", lambda: started_at + 540)
    warning = client.get(path + "/battle", headers=host).json()
    assert warning["warning"] is True and warning["ends_at"] - warning["server_time"] == 60
    monkeypatch.setattr(main_module.time, "time", lambda: started_at + 600)
    final = client.get(path, headers=host).json()
    assert final["competition"]["ended_at"] == started_at + 600
    assert final["battle"]["status"] == "complete" and final["battle"]["winner"] == "a"
    assert {photo["id"] for photo in final["feed"]} == {host_photo["id"], guest_photo["id"]}
    assert {row["username"] for row in final["standings"]} == {"alex", "private_guest", "private_fellow"}
    final_opponents = final["battle"]["teams"][1]["members"]
    assert [(member["username"], member["rank"]) for member in final_opponents] == ranked_members
    assert submit(client, host, battle["id"]).status_code == 409


def test_public_battle_shows_both_teams_and_guest_can_leave_lobby(client, monkeypatch):
    import importlib
    main_module = importlib.import_module("app.main")
    host, _ = account(client)
    guest, _ = account(client, "public_guest")
    battle = create_battle(client, host, visible=True, duration=1800)
    path = f"/competitions/{battle['id']}"
    client.post("/competitions/join", headers=guest, json={"code": battle["code"]})
    choose_team(client, guest, battle["id"], "b")
    assert client.post(path + "/battle/leave", headers=guest).status_code == 204
    assert client.get(path, headers=guest).status_code == 404
    client.post("/competitions/join", headers=guest, json={"code": battle["code"]})
    choose_team(client, host, battle["id"], "a")
    choose_team(client, guest, battle["id"], "b")
    started_at = int(time.time())
    monkeypatch.setattr(main_module.time, "time", lambda: started_at)
    client.post(path + "/battle/start", headers=host)
    submit(client, host, battle["id"])
    guest_photo = submit(client, guest, battle["id"]).json()
    detail = client.get(path, headers=host).json()
    assert len(detail["feed"]) == 2
    assert all(team["score"] == 1 for team in detail["battle"]["teams"])
    assert client.put(path + f"/photos/{guest_photo['id']}/reaction", headers=host, json={"emoji": "🔥"}).status_code == 200
