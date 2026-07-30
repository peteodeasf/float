"""parent experience MVP: weekly-focus flag, tip/message audience, moments

Revision ID: c1d2e3f4a5b6
Revises: b2e4a1c9d503
Create Date: 2026-07-30 00:00:00.000000

Foundation for the parent-facing app:
- accommodation_behaviors.is_weekly_focus — the one accommodation the clinician
  marks as this week's focus for the parent.
- jit_tips.audience / messages.audience — 'teen' | 'parent' discriminators so
  parent tips and the parent<->clinician chat thread stay separate from the
  child's. Existing rows default to 'teen' (no backfill needed).
- accommodation_moments — the parent "log a moment" table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b2e4a1c9d503'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'accommodation_behaviors',
        sa.Column('is_weekly_focus', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    )
    op.add_column(
        'jit_tips',
        sa.Column('audience', sa.String(), server_default=sa.text("'teen'"), nullable=False),
    )
    op.add_column(
        'messages',
        sa.Column('audience', sa.String(), server_default=sa.text("'teen'"), nullable=False),
    )
    op.create_table(
        'accommodation_moments',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('treatment_plan_id', sa.Uuid(), nullable=False),
        sa.Column('accommodation_id', sa.Uuid(), nullable=True),
        sa.Column('parent_user_id', sa.Uuid(), nullable=False),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('held', sa.Boolean(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['treatment_plan_id'], ['treatment_plans.id']),
        sa.ForeignKeyConstraint(['accommodation_id'], ['accommodation_behaviors.id']),
        sa.ForeignKeyConstraint(['parent_user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_accommodation_moments_plan', 'accommodation_moments', ['treatment_plan_id']
    )


def downgrade() -> None:
    op.drop_index('ix_accommodation_moments_plan', table_name='accommodation_moments')
    op.drop_table('accommodation_moments')
    op.drop_column('messages', 'audience')
    op.drop_column('jit_tips', 'audience')
    op.drop_column('accommodation_behaviors', 'is_weekly_focus')
