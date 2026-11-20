import os
import sqlite3
import subprocess
import sys
from pathlib import Path


def test_party_approval_migration_reconciles_recorded_votes(tmp_path):
    database = tmp_path / "party.db"
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{database.as_posix()}"}
    backend = Path(__file__).resolve().parents[1]

    def upgrade(revision):
        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", revision],
            cwd=backend,
            env=env,
            check=True,
            capture_output=True,
        )

    upgrade("0007")
    with sqlite3.connect(database) as db:
        db.executescript("""
            INSERT INTO users (id, username, password_hash, age_attested_at) VALUES
                ('host', 'host', 'hash', 1), ('voter1', 'voter1', 'hash', 1),
                ('voter2', 'voter2', 'hash', 1);
            INSERT INTO competitions (id, name, host_id, code, created_at, revision, mode)
                VALUES ('night', 'Party night', 'host', 'PARTYCODE', 1, 0, 'party');
            INSERT INTO party_rounds (id, competition_id, sequence, prompt_key, prompt, starts_at, ends_at) VALUES
                ('round1', 'night', 0, 'group', 'Group photo', 1, 1801),
                ('round2', 'night', 1, 'yellow', 'Something yellow', 1801, 3601);
            INSERT INTO submissions (id, competition_id, user_id, idempotency_key, rear, front, created_at, kind, party_round_id) VALUES
                ('photo1', 'night', 'host', 'key1', 'rear.jpg', 'front.jpg', 1, 'challenge', 'round1'),
                ('photo2', 'night', 'host', 'key2', 'rear.jpg', 'front.jpg', 1801, 'challenge', 'round2'),
                ('photo3', 'night', 'host', 'key3', 'rear.jpg', 'front.jpg', 1, 'drink', NULL);
            INSERT INTO challenge_claims (id, competition_id, user_id, submission_id, prompt, voters, round_id, approved) VALUES
                ('needs_approval', 'night', 'host', 'photo1', 'group', '["voter1","voter2"]', 'round1', 0),
                ('needs_revocation', 'night', 'host', 'photo2', 'yellow', '["voter1","voter2"]', 'round2', 1),
                ('legacy', 'night', 'host', 'photo3', 'pose', '["voter1","voter2"]', NULL, 0);
            INSERT INTO challenge_votes (claim_id, user_id, approve) VALUES
                ('needs_approval', 'voter1', 1), ('needs_approval', 'voter2', 1),
                ('needs_revocation', 'voter1', 1), ('needs_revocation', 'voter2', 0),
                ('legacy', 'voter1', 1), ('legacy', 'voter2', 1);
        """)

    upgrade("head")
    with sqlite3.connect(database) as db:
        approvals = dict(db.execute("SELECT id, approved FROM challenge_claims"))
    assert approvals == {"needs_approval": 1, "needs_revocation": 0, "legacy": 0}
