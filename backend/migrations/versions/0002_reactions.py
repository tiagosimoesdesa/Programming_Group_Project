"""Private photo reactions."""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("reactions", sa.Column("submission_id", sa.String(36), sa.ForeignKey("submissions.id"), primary_key=True), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True), sa.Column("emoji", sa.String(16), nullable=False))
    if op.get_bind().dialect.name == "postgresql":
        op.execute(sa.text('ALTER TABLE "reactions" ENABLE ROW LEVEL SECURITY'))

def downgrade():
    op.drop_table("reactions")
