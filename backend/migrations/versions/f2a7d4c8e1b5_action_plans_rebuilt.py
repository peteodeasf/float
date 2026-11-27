"""Action plans rebuilt as items, plus the tools list. docs/plans/action-plans-build.md

DESTRUCTIVE: drops the old `action_plans` table and every saved plan in it. Pre-launch those are
test data, and the feature has been switched off since 2026-09-01. The downgrade recreates the old
table empty.

Revision ID: f2a7d4c8e1b5
Revises: e7c1a9f3b2d6
Create Date: 2026-11-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = 'f2a7d4c8e1b5'
down_revision = 'e7c1a9f3b2d6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table('action_plans')

    op.create_table(
        'tools',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('link', sa.String(), nullable=True),
        sa.Column('display_order', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'action_plans',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('patient_id', sa.Uuid(), sa.ForeignKey('patient_profiles.id'), nullable=False),
        sa.Column('organization_id', sa.Uuid(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('practitioner_id', sa.Uuid(), sa.ForeignKey('practitioner_profiles.id'), nullable=False),
        sa.Column('session_number', sa.Integer(), nullable=False),
        sa.Column('session_date', sa.Date(), server_default=sa.text('CURRENT_DATE'), nullable=False),
        sa.Column('confidence', sa.String(), nullable=True),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("confidence IN ('low', 'medium', 'high')", name='ck_action_plans_confidence'),
        sa.UniqueConstraint('patient_id', 'session_number', name='uq_action_plans_patient_session'),
    )
    op.create_index('ix_action_plans_patient_id', 'action_plans', ['patient_id'])

    op.create_table(
        'action_plan_items',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('action_plan_id', sa.Uuid(), sa.ForeignKey('action_plans.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('position', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('avoidance_behavior_id', sa.Uuid(), sa.ForeignKey('avoidance_behaviors.id', ondelete='SET NULL'), nullable=True),
        sa.Column('accommodation_behavior_id', sa.Uuid(), sa.ForeignKey('accommodation_behaviors.id', ondelete='SET NULL'), nullable=True),
        sa.Column('tool_id', sa.Uuid(), sa.ForeignKey('tools.id', ondelete='SET NULL'), nullable=True),
        sa.Column('text', sa.Text(), nullable=True),
        sa.Column('reward_for', sa.Text(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('share_with_child', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('reward_given', sa.Boolean(), nullable=True),
        sa.Column('reward_given_by', sa.String(), nullable=True),
        sa.Column('reward_answered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('outcome', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            "kind IN ('exposure', 'tool', 'accommodation', 'parent_instruction', 'reward')",
            name='ck_action_plan_items_kind'),
        sa.CheckConstraint("outcome IN ('keep', 'done')", name='ck_action_plan_items_outcome'),
        sa.CheckConstraint("reward_given_by IN ('parent', 'clinician')", name='ck_action_plan_items_given_by'),
    )
    op.create_index('ix_action_plan_items_action_plan_id', 'action_plan_items', ['action_plan_id'])


def downgrade() -> None:
    op.drop_table('action_plan_items')
    op.drop_table('action_plans')
    op.drop_table('tools')
    op.create_table(
        'action_plans',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('patient_id', sa.Uuid(), sa.ForeignKey('patient_profiles.id'), nullable=False),
        sa.Column('organization_id', sa.Uuid(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('practitioner_id', sa.Uuid(), sa.ForeignKey('practitioner_profiles.id'), nullable=False),
        sa.Column('session_number', sa.Integer(), nullable=False),
        sa.Column('session_date', sa.Date(), server_default=sa.text('CURRENT_DATE'), nullable=False),
        sa.Column('nickname', sa.Text(), nullable=True),
        sa.Column('exposures', JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('behaviors_to_resist', JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('parent_instructions', JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('coping_tools', JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('cognitive_strategies', JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('additional_notes', sa.Text(), nullable=True),
        sa.Column('next_appointment', sa.Text(), nullable=True),
        sa.Column('visible_to_patient', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('visible_to_parent', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
