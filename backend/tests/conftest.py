import os
import tempfile
from pathlib import Path

TEST_CACHE = Path(__file__).resolve().parents[1] / ".pytest_cache"
TEST_CACHE.mkdir(exist_ok=True)
TEST_ROOT = Path(tempfile.mkdtemp(prefix="beerreal-test-", dir=TEST_CACHE))
os.environ["JWT_SECRET"] = "test-secret-which-is-long-enough-for-hs256"
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{(TEST_ROOT / 'test.db').as_posix()}")
os.environ["STORAGE_MODE"] = "local"
os.environ["UPLOAD_DIR"] = str(TEST_ROOT / "uploads")
os.environ["PUBLIC_URL"] = "http://testserver"

import pytest
from fastapi.testclient import TestClient
from app.db import Base, engine
from app.main import app


@pytest.fixture(autouse=True)
def database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client
