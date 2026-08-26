"""ladder rungs may exist before they are grouped into a situation

Revision ID: d4c7b1e8f309
Revises: b9f1c2d3e4a5
Create Date: 2026-08-25 00:00:00.000000

Additive: relaxes avoidance_behaviors.trigger_situation_id to nullable, and adds
treatment_plan_id so an ungrouped rung still belongs to a plan.

A rung is a sentence with a score; the situation is a grouping applied to it,
possibly later and possibly by AI. Requiring the group up front is what made the
situation a folder you had to open before you could write anything.

NOT destructive: no rows are removed, no column is dropped. Existing rungs keep
their situation, and treatment_plan_id is backfilled from it.
"""
from typing import Sequence, Union

from alembic import op, context
import sqlalchemy as sa


revision: str = 'd4c7b1e8f309'
down_revision: Union[str, None] = 'b9f1c2d3e4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


BACKFILL = """
UPDATE avoidance_behaviors AS b
   SET treatment_plan_id = t.treatment_plan_id
  FROM trigger_situations AS t
 WHERE b.trigger_situation_id = t.id
   AND b.treatment_plan_id IS NULL
"""


def upgrade() -> None:
    op.alter_column(
        'avoidance_behaviors', 'trigger_situation_id',
        existing_type=sa.Uuid(), nullable=True,
    )
    op.add_column(
        'avoidance_behaviors',
        sa.Column('treatment_plan_id', sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        'fk_avoidance_behaviors_plan', 'avoidance_behaviors', 'treatment_plans',
        ['treatment_plan_id'], ['id'],
    )
    op.create_index(
        'ix_avoidance_behaviors_plan', 'avoidance_behaviors', ['treatment_plan_id'],
    )
    if not context.is_offline_mode():
        op.execute(sa.text(BACKFILL))


def downgrade() -> None:
    op.drop_index('ix_avoidance_behaviors_plan', table_name='avoidance_behaviors')
    op.drop_constraint('fk_avoidance_behaviors_plan', 'avoidance_behaviors', type_='foreignkey')
    op.drop_column('avoidance_behaviors', 'treatment_plan_id')
    # Ungrouped rungs cannot satisfy the old NOT NULL constraint.
    op.execute(sa.text("DELETE FROM avoidance_behaviors WHERE trigger_situation_id IS NULL"))
    op.alter_column(
        'avoidance_behaviors', 'trigger_situation_id',
        existing_type=sa.Uuid(), nullable=False,
    )
