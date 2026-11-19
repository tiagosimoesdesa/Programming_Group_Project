"""Reconcile historical Party approvals with their recorded votes."""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"


def upgrade():
    claims = sa.table(
        "challenge_claims",
        sa.column("id", sa.String),
        sa.column("round_id", sa.String),
        sa.column("voters", sa.JSON),
        sa.column("approved", sa.Boolean),
    )
    votes = sa.table(
        "challenge_votes",
        sa.column("claim_id", sa.String),
        sa.column("approve", sa.Boolean),
    )
    approvals = (
        sa.select(sa.func.count())
        .select_from(votes)
        .where(votes.c.claim_id == claims.c.id, votes.c.approve.is_(True))
        .scalar_subquery()
    )
    majority = approvals * 2 > sa.func.json_array_length(claims.c.voters)
    op.execute(
        claims.update()
        .where(claims.c.round_id.is_not(None), claims.c.approved != majority)
        .values(approved=majority)
    )


def downgrade():
    # Keep approvals consistent with the recorded votes.
    pass
