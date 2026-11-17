"""Initial BEERREAL schema."""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("users", sa.Column("id", sa.String(36), primary_key=True), sa.Column("username", sa.String(24), nullable=False, unique=True), sa.Column("password_hash", sa.String(), nullable=False), sa.Column("avatar", sa.String()), sa.Column("age_attested_at", sa.Integer(), nullable=False))
    op.create_table("competitions", sa.Column("id", sa.String(36), primary_key=True), sa.Column("name", sa.String(60), nullable=False), sa.Column("host_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False), sa.Column("code", sa.String(10), unique=True, nullable=False), sa.Column("created_at", sa.Integer(), nullable=False), sa.Column("ended_at", sa.Integer()), sa.Column("revision", sa.Integer(), nullable=False))
    op.create_table("memberships", sa.Column("competition_id", sa.String(36), sa.ForeignKey("competitions.id"), primary_key=True), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True))
    op.create_table("submissions", sa.Column("id", sa.String(36), primary_key=True), sa.Column("competition_id", sa.String(36), sa.ForeignKey("competitions.id"), nullable=False), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False), sa.Column("idempotency_key", sa.String(36), nullable=False), sa.Column("rear", sa.String(), nullable=False), sa.Column("front", sa.String(), nullable=False), sa.Column("created_at", sa.Integer(), nullable=False), sa.UniqueConstraint("competition_id", "user_id", "idempotency_key"))
    op.create_index("ix_submissions_competition_id", "submissions", ["competition_id"])
    op.create_table("refresh_sessions", sa.Column("token_hash", sa.String(64), primary_key=True), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False), sa.Column("expires_at", sa.Integer(), nullable=False))
    op.create_index("ix_refresh_sessions_user_id", "refresh_sessions", ["user_id"])
    op.create_table("login_attempts", sa.Column("key", sa.String(64), primary_key=True), sa.Column("count", sa.Integer(), nullable=False), sa.Column("window", sa.Integer(), nullable=False))
    if op.get_bind().dialect.name == "postgresql":
        for table in ("users", "competitions", "memberships", "submissions", "refresh_sessions", "login_attempts"):
            op.execute(sa.text(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY'))


def downgrade():
    for name in ["login_attempts", "refresh_sessions", "submissions", "memberships", "competitions", "users"]:
        op.drop_table(name)
