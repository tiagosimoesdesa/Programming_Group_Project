"""Add personal history visibility to competition memberships."""
from alembic import op
import sqlalchemy as sa


revision = "0010"
down_revision = "0009"


def upgrade():
    op.add_column("memberships", sa.Column("history_hidden_at", sa.Integer(), nullable=True))
    op.add_column("memberships", sa.Column("history_removed_at", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("memberships", "history_removed_at")
    op.drop_column("memberships", "history_hidden_at")
