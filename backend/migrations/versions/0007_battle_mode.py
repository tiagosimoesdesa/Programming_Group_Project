"""Battle mode with timed teams and private scoring."""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"


def upgrade():
    op.add_column("competitions", sa.Column("battle_duration_seconds", sa.Integer(), nullable=True))
    op.add_column("competitions", sa.Column("battle_points_visible", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("competitions", sa.Column("battle_team_a_name", sa.String(40), nullable=True))
    op.add_column("competitions", sa.Column("battle_team_b_name", sa.String(40), nullable=True))
    op.add_column("competitions", sa.Column("battle_started_at", sa.Integer(), nullable=True))
    op.add_column("memberships", sa.Column("team", sa.String(1), nullable=True))


def downgrade():
    op.drop_column("memberships", "team")
    op.drop_column("competitions", "battle_started_at")
    op.drop_column("competitions", "battle_team_b_name")
    op.drop_column("competitions", "battle_team_a_name")
    op.drop_column("competitions", "battle_points_visible")
    op.drop_column("competitions", "battle_duration_seconds")
