"""Classic and timed Party modes."""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"


def upgrade():
    op.add_column("competitions", sa.Column("mode", sa.String(16), nullable=False, server_default="classic"))
    op.add_column("competitions", sa.Column("party_started_at", sa.Integer(), nullable=True))
    op.create_table(
        "party_rounds",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("competition_id", sa.String(36), sa.ForeignKey("competitions.id"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("prompt_key", sa.String(40), nullable=False),
        sa.Column("prompt", sa.String(160), nullable=False),
        sa.Column("starts_at", sa.Integer(), nullable=False),
        sa.Column("ends_at", sa.Integer(), nullable=False),
        sa.UniqueConstraint("competition_id", "sequence"),
        sa.UniqueConstraint("competition_id", "prompt_key"),
    )
    op.create_index("ix_party_rounds_competition_id", "party_rounds", ["competition_id"])
    with op.batch_alter_table("submissions") as batch:
        batch.add_column(sa.Column("kind", sa.String(16), nullable=False, server_default="drink"))
        batch.add_column(sa.Column("party_round_id", sa.String(36), nullable=True))
        batch.create_foreign_key("fk_submissions_party_round", "party_rounds", ["party_round_id"], ["id"])
        batch.create_index("ix_submissions_party_round_id", ["party_round_id"])
    with op.batch_alter_table("challenge_claims") as batch:
        batch.add_column(sa.Column("round_id", sa.String(36), nullable=True))
        batch.add_column(sa.Column("approved", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.create_foreign_key("fk_challenge_claims_party_round", "party_rounds", ["round_id"], ["id"])
        batch.create_index("ix_challenge_claims_round_id", ["round_id"])
    if op.get_context().dialect.name == "postgresql":
        for table in ("party_rounds",):
            op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade():
    with op.batch_alter_table("challenge_claims") as batch:
        batch.drop_index("ix_challenge_claims_round_id")
        batch.drop_constraint("fk_challenge_claims_party_round", type_="foreignkey")
        batch.drop_column("approved")
        batch.drop_column("round_id")
    with op.batch_alter_table("submissions") as batch:
        batch.drop_index("ix_submissions_party_round_id")
        batch.drop_constraint("fk_submissions_party_round", type_="foreignkey")
        batch.drop_column("party_round_id")
        batch.drop_column("kind")
    op.drop_index("ix_party_rounds_competition_id", table_name="party_rounds")
    op.drop_table("party_rounds")
    op.drop_column("competitions", "party_started_at")
    op.drop_column("competitions", "mode")
