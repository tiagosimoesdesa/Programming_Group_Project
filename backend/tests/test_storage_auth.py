import pytest
from fastapi import HTTPException

from app import storage
from app.config import settings


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeStorageClient:
    def __init__(self):
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        paths = kwargs["json"]["paths"]
        return FakeResponse([
            {"path": path, "signedURL": f"/object/sign/beerreal/{path}?token=test"}
            for path in paths
        ])


def test_current_secret_key_uses_only_apikey_header(monkeypatch):
    monkeypatch.setattr(settings, "supabase_secret_key", "sb_secret_test-value")
    monkeypatch.setattr(settings, "supabase_service_key", "")

    assert storage.headers() == {"apikey": "sb_secret_test-value"}


def test_legacy_service_role_key_keeps_bearer_header(monkeypatch):
    monkeypatch.setattr(settings, "supabase_secret_key", "")
    monkeypatch.setattr(settings, "supabase_service_key", "legacy.jwt.value")

    assert storage.headers() == {
        "apikey": "legacy.jwt.value",
        "Authorization": "Bearer legacy.jwt.value",
    }


def test_private_photo_urls_are_batch_signed_and_cached(monkeypatch):
    fake = FakeStorageClient()
    monkeypatch.setattr(settings, "storage_mode", "supabase")
    monkeypatch.setattr(settings, "supabase_url", "https://storage.example")
    monkeypatch.setattr(settings, "supabase_secret_key", "sb_secret_test")
    monkeypatch.setattr(settings, "supabase_bucket", "beerreal")
    monkeypatch.setattr(storage, "_storage_client", fake)
    with storage._signed_urls_lock:
        storage._signed_urls.clear()

    storage.prime_photo_urls(["events/a/rear.jpg", "events/a/front.jpg", "events/a/rear.jpg"])
    rear = storage.photo_url("events/a/rear.jpg")
    front = storage.photo_url("events/a/front.jpg")

    assert len(fake.calls) == 1
    url, request = fake.calls[0]
    assert url == "https://storage.example/storage/v1/object/sign/beerreal"
    assert request["json"] == {
        "expiresIn": storage.SIGNED_URL_SECONDS,
        "paths": ["events/a/rear.jpg", "events/a/front.jpg"],
    }
    assert rear.endswith("/object/sign/beerreal/events/a/rear.jpg?token=test")
    assert front.endswith("/object/sign/beerreal/events/a/front.jpg?token=test")


def test_malformed_signed_photo_batch_returns_retryable_error_without_caching(monkeypatch):
    paths = ["events/b/rear.jpg", "events/b/front.jpg"]
    fake = FakeStorageClient()
    payload = [
        {"path": paths[0], "signedURL": "/object/sign/beerreal/events/b/rear.jpg?token=test"},
        None,
    ]
    monkeypatch.setattr(settings, "storage_mode", "supabase")
    monkeypatch.setattr(storage, "_signed_urls", {})
    monkeypatch.setattr(storage, "_storage_client", fake)
    with monkeypatch.context() as failed_signing:
        failed_signing.setattr(fake, "post", lambda *args, **kwargs: FakeResponse(payload))
        with pytest.raises(HTTPException) as response:
            storage.prime_photo_urls(paths)
        assert response.value.status_code == 503
        assert not storage._signed_urls

    storage.prime_photo_urls(paths)
    assert fake.calls[0][1]["json"]["paths"] == paths
