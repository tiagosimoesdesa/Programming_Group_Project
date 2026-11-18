"""Count the beers visible in each drink submission."""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"


def upgrade():
    op.add_column(
        "submissions",
        sa.Column("beer_count", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade():
    op.drop_column("submissions", "beer_count")
