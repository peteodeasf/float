"""The parent's accommodation experiments

One planned attempt by a parent at not doing an accommodation, with a prediction before and how it
went after. docs/plans/parent-accommodation-experiments.md

Additive: a new table.

Revision ID: b8e2f4a61c09
Revises: a1d7e3c95b42
Create Date: 2026-09-11
"""
from alembic import op
import sqlalchemy as sa

revision = 'b8e2f4a61c09'
down_revision = 'a1d7e3c95b42'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'parent_experiments',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('treatment_plan_id', sa.UUID(), nullable=False),
        sa.Column('accommodation_id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('parent_user_id', sa.UUID(), nullable=True),
        sa.Column('status', sa.String(), server_default='planned', nullable=False),
        sa.Column('scheduled_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('scheduled_time_bucket', sa.String(), nullable=False),
        sa.Column('instead', sa.Text(), nullable=True),
        sa.Column('prediction', sa.Text(), nullable=False),
        sa.Column('belief_before', sa.Numeric(5, 2), nullable=False),
        sa.Column('expected_fear', sa.Numeric(3, 1), nullable=False),
        sa.Column('readiness', sa.String(), nullable=True),
        sa.Column('did_it', sa.String(), nullable=True),
        sa.Column('what_happened', sa.Text(), nullable=True),
        sa.Column('actual_fear', sa.Numeric(3, 1), nullable=True),
        sa.Column('prediction_happened', sa.String(), nullable=True),
        sa.Column('belief_after', sa.Numeric(5, 2), nullable=True),
        sa.Column('what_learned', sa.Text(), nullable=True),
        sa.Column('too_hard_reason', sa.Text(), nullable=True),
        sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['treatment_plan_id'], ['treatment_plans.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['accommodation_id'], ['accommodation_behaviors.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['parent_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_parent_experiments_treatment_plan_id', 'parent_experiments', ['treatment_plan_id'])


def downgrade() -> None:
    op.drop_index('ix_parent_experiments_treatment_plan_id', table_name='parent_experiments')
    op.drop_table('parent_experiments')
