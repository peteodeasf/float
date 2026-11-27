"""Tools and strategies become pages: kind, audience, summary, blocks, examples, images,
highlights and opens. docs/plans/tools-and-strategies.md

Changes `tools` in place. Drops `tools.link` and `tools.is_active` (any saved links are lost; the
tools list in production is empty). Renames `description` to `summary`. Every other change adds.

Revision ID: b7d2e4f6a8c1
Revises: a3e9c5d71f20
Create Date: 2026-11-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = 'b7d2e4f6a8c1'
down_revision = 'a3e9c5d71f20'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('tools', 'description', new_column_name='summary')
    op.drop_column('tools', 'link')
    op.drop_column('tools', 'is_active')
    op.add_column('tools', sa.Column('kind', sa.String(), server_default='tool', nullable=False))
    op.add_column('tools', sa.Column('audience', sa.String(), server_default='both', nullable=False))
    op.add_column('tools', sa.Column('blocks', JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False))
    op.add_column('tools', sa.Column('is_published', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.create_check_constraint('ck_tools_kind', 'tools', "kind IN ('tool', 'strategy')")
    op.create_check_constraint('ck_tools_audience', 'tools', "audience IN ('child', 'parent', 'both')")

    op.create_table(
        'tool_examples',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('tool_id', sa.Uuid(), sa.ForeignKey('tools.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('how_used', sa.Text(), nullable=True),
        sa.Column('position', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_tool_examples_tool_id', 'tool_examples', ['tool_id'])

    op.create_table(
        'tool_images',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('content_type', sa.String(), nullable=False),
        sa.Column('data', sa.LargeBinary(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'tool_highlights',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('tool_id', sa.Uuid(), sa.ForeignKey('tools.id', ondelete='CASCADE'), nullable=False),
        sa.Column('patient_id', sa.Uuid(), sa.ForeignKey('patient_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('organization_id', sa.Uuid(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('for_child', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('for_parent', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('highlighted_by', sa.Uuid(), sa.ForeignKey('practitioner_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tool_id', 'patient_id', name='uq_tool_highlights_tool_patient'),
    )
    op.create_index('ix_tool_highlights_patient_id', 'tool_highlights', ['patient_id'])

    op.create_table(
        'tool_opens',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('tool_id', sa.Uuid(), sa.ForeignKey('tools.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('patient_id', sa.Uuid(), sa.ForeignKey('patient_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('opened_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tool_id', 'user_id', name='uq_tool_opens_tool_user'),
    )
    op.create_index('ix_tool_opens_patient_id', 'tool_opens', ['patient_id'])

    op.add_column('action_plan_items', sa.Column(
        'tool_example_id', sa.Uuid(), sa.ForeignKey('tool_examples.id', ondelete='SET NULL'), nullable=True))


def downgrade() -> None:
    op.drop_column('action_plan_items', 'tool_example_id')
    op.drop_table('tool_opens')
    op.drop_table('tool_highlights')
    op.drop_table('tool_images')
    op.drop_table('tool_examples')
    op.drop_constraint('ck_tools_audience', 'tools')
    op.drop_constraint('ck_tools_kind', 'tools')
    op.drop_column('tools', 'is_published')
    op.drop_column('tools', 'blocks')
    op.drop_column('tools', 'audience')
    op.drop_column('tools', 'kind')
    op.add_column('tools', sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False))
    op.add_column('tools', sa.Column('link', sa.String(), nullable=True))
    op.alter_column('tools', 'summary', new_column_name='description')
