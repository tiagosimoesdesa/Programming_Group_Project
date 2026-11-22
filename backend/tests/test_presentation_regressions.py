import io
import time
import uuid

import pytest
from fastapi import UploadFile
from PIL import Image
from starlette.datastructures import Headers

from app import storage
from test_api import WEB_ORIGIN, account, choose_team, create_battle, event, image, submit


@pytest.mark.parametrize("path", ["/auth/register", "/auth/web/register"])
def test_invalid_password_is_not_echoed(client, path):
    password = "disposable-secret-without-numbers"
    response = client.post(
        path, headers={"Origin": WEB_ORIGIN},
        json={"username": "presenter", "password": password, "legal_age": True},
    )
    assert response.status_code == 422
    assert password not in response.text
    assert response.json()["detail"][0]["loc"] == ["body", "password"]


def test_unicode_letters_do_not_count_as_password_punctuation(client):
    credentials = {"username": "presenter", "password": "caféab٢", "legal_age": True}
    response = client.post("/auth/register", json=credentials)
    assert response.status_code == 422
    assert "special character" in response.json()["detail"][0]["msg"]
    credentials["password"] += "!"
    assert client.post("/auth/register", json=credentials).status_code == 201


def test_photo_keeps_camera_orientation_after_stripping_metadata():
    source = io.BytesIO()
    exif = Image.Exif()
    exif[274] = 6  # Rotate the stored landscape pixels 90 degrees clockwise.
    Image.new("RGB", (64, 32), "gold").save(source, "JPEG", exif=exif)
    source.seek(0)
    upload = UploadFile(source, headers=Headers({"content-type": "image/jpeg"}))
    with Image.open(io.BytesIO(storage.validate_image(upload))) as processed:
        assert processed.size == (32, 64)
        assert not processed.getexif()


def test_accepted_battle_upload_can_be_retried_after_expiry(client, monkeypatch):
    host, _ = account(client)
    guest, _ = account(client, "rehearsal_guest")
    battle = create_battle(client, host)
    path = f"/competitions/{battle['id']}"
    assert client.post("/competitions/join", headers=guest, json={"code": battle["code"]}).status_code == 200
    assert choose_team(client, host, battle["id"], "a").status_code == 200
    assert choose_team(client, guest, battle["id"], "b").status_code == 200

    started_at = int(time.time())
    monkeypatch.setattr(time, "time", lambda: started_at)
    assert client.post(path + "/battle/start", headers=host).status_code == 200
    key = str(uuid.uuid4())
    accepted = submit(client, host, battle["id"], key, beer_count=2, pint_count=1)
    assert accepted.status_code == 201

    monkeypatch.setattr(time, "time", lambda: started_at + 600)
    retry = submit(client, host, battle["id"], key, beer_count=2, pint_count=1)
    assert retry.status_code == 201
    assert retry.json()["id"] == accepted.json()["id"]
    assert submit(client, host, battle["id"]).status_code == 409
    assert client.get(path, headers=host).json()["battle"]["teams"][0]["score"] == 3


def test_party_retries_are_scoped_to_the_original_submission(client, monkeypatch):
    host, _ = account(client)
    guest, _ = account(client, "rehearsal_guest")
    night = event(client, host, "party")
    path = f"/competitions/{night['id']}"
    assert client.post("/competitions/join", headers=guest, json={"code": night["code"]}).status_code == 200
    started_at = int(time.time())
    monkeypatch.setattr(time, "time", lambda: started_at)
    party = client.post(path + "/party/start", headers=host)
    assert party.status_code == 200
    round_id = party.json()["active_round"]["id"]

    def attempt(round_id, key):
        return client.post(
            path + f"/party/rounds/{round_id}/attempts",
            headers={**host, "Idempotency-Key": key},
            files={side: (f"{side}.jpg", image(), "image/jpeg") for side in ("rear", "front")},
        )

    drink_key = str(uuid.uuid4())
    challenge_key = str(uuid.uuid4())
    assert submit(client, host, night["id"], drink_key).status_code == 201
    assert attempt(round_id, drink_key).status_code == 409
    accepted = attempt(round_id, challenge_key)
    assert accepted.status_code == 201
    assert submit(client, host, night["id"], challenge_key).status_code == 409

    monkeypatch.setattr(time, "time", lambda: started_at + 1800)
    later = client.get(path + "/party", headers=host).json()["active_round"]["id"]
    assert attempt(later, challenge_key).status_code == 409
    assert client.post(path + "/end", headers=host).status_code == 200
    retry = attempt(round_id, challenge_key)
    assert retry.status_code == 201
    assert retry.json()["status"] == "ended"
    assert [record["id"] for record in retry.json()["attempts"]] == [accepted.json()["attempts"][0]["id"]]
    assert attempt(later, str(uuid.uuid4())).status_code == 409
