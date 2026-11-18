"""Exercise the actual migration against historical submissions."""
import os
from pathlib import Path
import sqlite3
import subprocess
import sys


def test_beer_points_migration_preserves_history(tmp_path):
    database = tmp_path / "history.db"
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{database}"}
    backend = Path(__file__).resolve().parents[1]

    def migrate(direction, target):
        subprocess.run([sys.executable, "-m", "alembic", direction, target], cwd=backend, env=env, check=True, capture_output=True)

    migrate("upgrade", "0005")
    with sqlite3.connect(database) as db:
        db.execute("INSERT INTO users (id, username, password_hash, age_attested_at) VALUES ('u', 'olduser', 'hash', 1)")
        db.execute("INSERT INTO competitions (id, name, host_id, code, created_at, revision) VALUES ('e', 'Old night', 'u', 'ABCDEFGH', 1, 0)")
        db.execute("INSERT INTO submissions (id, competition_id, user_id, idempotency_key, beer_count, rear, front, created_at) VALUES ('s', 'e', 'u', 'key', 5, 'rear.jpg', 'front.jpg', 1)")
    migrate("upgrade", "head")
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT beer_count, pint_count, rear, front FROM submissions").fetchone() == (5, 0, "rear.jpg", "front.jpg")
        assert db.execute("SELECT version_num FROM alembic_version").fetchone() == ("0007",)
    migrate("downgrade", "0005")
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT beer_count FROM submissions").fetchone() == (5,)
    migrate("upgrade", "head")
