"""The parent's weekly check-in on their focus accommodation

Replaces logging each moment (Peter, 2026-09-10). One answer per parent, accommodation and week:
every_time, mostly or gave_in. docs/plans/weekly-checkin.md

Additive: a new table. accommodation_moments is left in place; nothing writes to it any more.

Revision ID: d3a8e6f41b27
Revises: c7f2a9d31e64
Create Date: 2026-09-10
"""
from alembic import op
import sqlalchemy as sa

revision = 'd3a8e6f41b27'
down_revision = 'c7f2a9d31e64'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'accommodation_checkins',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('treatment_plan_id', sa.UUID(), nullable=False),
        sa.Column('accommodation_id', sa.UUID(), nullable=False),
        sa.Column('parent_user_id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('week_start', sa.Date(), nullable=False),
        sa.Column('answer', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['treatment_plan_id'], ['treatment_plans.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['accommodation_id'], ['accommodation_behaviors.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['parent_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('accommodation_id', 'parent_user_id', 'week_start', name='uq_checkin_per_week'),
    )
    op.create_index('ix_accommodation_checkins_treatment_plan_id', 'accommodation_checkins', ['treatment_plan_id'])


def downgrade() -> None:
    op.drop_index('ix_accommodation_checkins_treatment_plan_id', table_name='accommodation_checkins')
    op.drop_table('accommodation_checkins')
