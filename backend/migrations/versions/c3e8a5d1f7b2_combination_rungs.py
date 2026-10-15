"""Combination rungs: the safety behaviour a rung is "without"

Peter, 2026-10-15, after clinical review with Dr. Walker: a rung can be the situation without one
safety behaviour. The rung points at that safety behaviour, one rung per behaviour.
docs/plans/ladder-combinations.md.

Additive: one nullable column, its foreign key, and a unique index. Drops nothing.

Revision ID: c3e8a5d1f7b2
Revises: f1a2c3d4e5b6
Create Date: 2026-10-15
"""
from alembic import op
import sqlalchemy as sa

revision = "c3e8a5d1f7b2"
down_revision = "f1a2c3d4e5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "avoidance_behaviors",
        sa.Column("without_behavior_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_avoidance_behaviors_without_behavior_id",
        "avoidance_behaviors",
        "avoidance_behaviors",
        ["without_behavior_id"],
        ["id"],
    )
    op.create_unique_constraint(
        "uq_avoidance_behaviors_without_behavior_id",
        "avoidance_behaviors",
        ["without_behavior_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_avoidance_behaviors_without_behavior_id", "avoidance_behaviors", type_="unique"
    )
    op.drop_constraint(
        "fk_avoidance_behaviors_without_behavior_id", "avoidance_behaviors", type_="foreignkey"
    )
    op.drop_column("avoidance_behaviors", "without_behavior_id")
