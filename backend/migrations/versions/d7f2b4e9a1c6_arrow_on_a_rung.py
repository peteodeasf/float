"""The downward arrow sits on a ladder step, not only on a situation

Peter, 2026-10-15, after clinical review with Dr. Walker: the downward arrow is done for each
combination (a situation without one safety behaviour), not for the situation as a whole.
docs/plans/ladder-combinations.md, step 3.

An arrow on a step carries `rung_id` and leaves `trigger_situation_id` empty, so it does not
collide with the one-arrow-per-situation rule and code that looks up a situation's arrow does not
pick it up by mistake.

Additive: one nullable column, its foreign key, and a unique constraint. Drops nothing.

Revision ID: d7f2b4e9a1c6
Revises: c3e8a5d1f7b2
Create Date: 2026-10-15
"""
from alembic import op
import sqlalchemy as sa

revision = "d7f2b4e9a1c6"
down_revision = "c3e8a5d1f7b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("downward_arrows", sa.Column("rung_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_downward_arrows_rung_id", "downward_arrows", "avoidance_behaviors",
        ["rung_id"], ["id"],
    )
    op.create_unique_constraint(
        "uq_downward_arrows_rung_facilitated_by", "downward_arrows", ["rung_id", "facilitated_by"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_downward_arrows_rung_facilitated_by", "downward_arrows", type_="unique")
    op.drop_constraint("fk_downward_arrows_rung_id", "downward_arrows", type_="foreignkey")
    op.drop_column("downward_arrows", "rung_id")
