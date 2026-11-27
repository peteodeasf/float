"""Action plans run between two dates and are checked in on line by line.
docs/plans/action-plans-build.md

Adds action_plans.ends_on (a week after the start for existing plans), the tick and check-in note
on each line, and experiments.recorded_by.

DESTRUCTIVE: drops action_plans.confidence (confidence is now per exposure), and the line columns
reward_given, reward_given_by, reward_answered_at and outcome. A reward marked given carries over as
a tick. Pre-launch these are test data.

Revision ID: d5f9b2c7e4a1
Revises: c4e8a1d3f6b9
Create Date: 2026-11-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'd5f9b2c7e4a1'
down_revision = 'c4e8a1d3f6b9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('action_plans', sa.Column('ends_on', sa.Date(), nullable=True))
    op.execute("UPDATE action_plans SET ends_on = session_date + 7")
    op.alter_column('action_plans', 'ends_on', nullable=False)
    op.drop_constraint('ck_action_plans_confidence', 'action_plans')
    op.drop_column('action_plans', 'confidence')

    op.add_column('action_plan_items', sa.Column('done_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('action_plan_items', sa.Column('done_by', sa.String(), nullable=True))
    op.add_column('action_plan_items', sa.Column('check_note', sa.Text(), nullable=True))
    op.execute(
        "UPDATE action_plan_items SET done_at = coalesce(reward_answered_at, now()), done_by = reward_given_by "
        "WHERE kind = 'reward' AND reward_given IS TRUE"
    )
    op.drop_constraint('ck_action_plan_items_outcome', 'action_plan_items')
    op.drop_constraint('ck_action_plan_items_given_by', 'action_plan_items')
    op.drop_column('action_plan_items', 'outcome')
    op.drop_column('action_plan_items', 'reward_given')
    op.drop_column('action_plan_items', 'reward_given_by')
    op.drop_column('action_plan_items', 'reward_answered_at')
    op.create_check_constraint('ck_action_plan_items_done_by', 'action_plan_items',
                               "done_by IN ('clinician', 'child', 'parent')")

    op.add_column('experiments', sa.Column('recorded_by', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('experiments', 'recorded_by')
    op.drop_constraint('ck_action_plan_items_done_by', 'action_plan_items')
    op.add_column('action_plan_items', sa.Column('reward_answered_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('action_plan_items', sa.Column('reward_given_by', sa.String(), nullable=True))
    op.add_column('action_plan_items', sa.Column('reward_given', sa.Boolean(), nullable=True))
    op.add_column('action_plan_items', sa.Column('outcome', sa.String(), nullable=True))
    op.execute(
        "UPDATE action_plan_items SET reward_given = true, reward_given_by = done_by, reward_answered_at = done_at "
        "WHERE kind = 'reward' AND done_at IS NOT NULL AND done_by IN ('parent', 'clinician')"
    )
    op.create_check_constraint('ck_action_plan_items_given_by', 'action_plan_items',
                               "reward_given_by IN ('parent', 'clinician')")
    op.create_check_constraint('ck_action_plan_items_outcome', 'action_plan_items', "outcome IN ('keep', 'done')")
    op.drop_column('action_plan_items', 'check_note')
    op.drop_column('action_plan_items', 'done_by')
    op.drop_column('action_plan_items', 'done_at')
    op.add_column('action_plans', sa.Column('confidence', sa.String(), nullable=True))
    op.create_check_constraint('ck_action_plans_confidence', 'action_plans', "confidence IN ('low', 'medium', 'high')")
    op.drop_column('action_plans', 'ends_on')
