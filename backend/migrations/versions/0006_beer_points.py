"""Track pints within the existing total beer count.

Historical drinks retain their quantity and score: all default to regular beers.
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"


def upgrade():
    with op.batch_alter_table("submissions") as batch:
        batch.add_column(sa.Column("pint_count", sa.Integer(), nullable=False, server_default="0"))
        batch.create_check_constraint("valid_pint_count", "pint_count >= 0 AND pint_count <= beer_count")


def downgrade():
    with op.batch_alter_table("submissions") as batch:
        batch.drop_constraint("valid_pint_count", type_="check")
        batch.drop_column("pint_count")
