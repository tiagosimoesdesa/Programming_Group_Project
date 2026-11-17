"""Optional challenges and invited spectators."""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("memberships", sa.Column("role", sa.String(16), nullable=False, server_default="player"))
    op.add_column("competitions", sa.Column("challenges_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("competitions", sa.Column("spectator_code", sa.String(10)))
    op.create_index("ix_competitions_spectator_code", "competitions", ["spectator_code"], unique=True)
    op.create_table("challenge_claims", sa.Column("id", sa.String(36), primary_key=True), sa.Column("competition_id", sa.String(36), sa.ForeignKey("competitions.id"), nullable=False), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False), sa.Column("submission_id", sa.String(36), sa.ForeignKey("submissions.id"), nullable=False), sa.Column("prompt", sa.String(30), nullable=False), sa.Column("voters", sa.JSON(), nullable=False), sa.UniqueConstraint("competition_id", "user_id", "prompt"))
    op.create_index("ix_challenge_claims_competition_id", "challenge_claims", ["competition_id"])
    op.create_table("challenge_votes", sa.Column("claim_id", sa.String(36), sa.ForeignKey("challenge_claims.id"), primary_key=True), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True), sa.Column("approve", sa.Boolean(), nullable=False))
    if op.get_bind().dialect.name == "postgresql":
        for table in ("challenge_claims", "challenge_votes"):
            op.execute(sa.text(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY'))

def downgrade():
    op.drop_table("challenge_votes")
    op.drop_table("challenge_claims")
    op.drop_index("ix_competitions_spectator_code", table_name="competitions")
    op.drop_column("competitions", "spectator_code")
    op.drop_column("competitions", "challenges_enabled")
    op.drop_column("memberships", "role")
