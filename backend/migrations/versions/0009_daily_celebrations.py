"""Store one verified celebration card per calendar date."""
from alembic import op
import sqlalchemy as sa


revision = "0009"
down_revision = "0008"


def upgrade():
    op.create_table(
        "daily_celebrations",
        sa.Column("date", sa.String(10), primary_key=True),
        sa.Column("title", sa.String(140), nullable=False),
        sa.Column("fact", sa.String(360), nullable=False),
        sa.Column("source_title", sa.String(180), nullable=False),
        sa.Column("source_url", sa.String(1000), nullable=False),
        sa.Column("created_at", sa.Integer(), nullable=False),
    )


def downgrade():
    op.drop_table("daily_celebrations")
