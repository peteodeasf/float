"""Ad-hoc downward arrow: a typed situation on situation-agnostic arrows

Peter, 2026-09-23: a therapist can run a downward arrow on its own, off the ladder, starting by
typing a situation. That situation has nowhere to live today (plan-linked arrows get it from the
trigger situation; the parent arrow is situation-less). Add a nullable column to hold it.
docs/plans/adhoc-downward-arrow.md

Additive and nullable — safe, non-destructive.

Revision ID: e2b9f4c17a06
Revises: b7e3f1a9c2d4
Create Date: 2026-09-23
"""
from alembic import op
import sqlalchemy as sa

revision = "e2b9f4c17a06"
down_revision = "b7e3f1a9c2d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "downward_arrows",
        sa.Column("situation_text", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("downward_arrows", "situation_text")
