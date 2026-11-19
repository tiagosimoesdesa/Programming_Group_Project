from app import storage
from app.config import settings


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
