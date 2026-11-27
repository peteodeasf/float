"""Whether a tool line on an action plan is for the parent alone. docs/plans/action-plans-build.md

Additive: one column, false by default. Lines that link a parent-only page are marked from it.

Revision ID: c4e8a1d3f6b9
Revises: b7d2e4f6a8c1
Create Date: 2026-11-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'c4e8a1d3f6b9'
down_revision = 'b7d2e4f6a8c1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('action_plan_items', sa.Column(
        'parent_only', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.execute(
        "UPDATE action_plan_items SET parent_only = true "
        "FROM tools WHERE action_plan_items.tool_id = tools.id AND tools.audience = 'parent'"
    )
    # Before this, a tool line with no page could only be one whose page was deleted, and the child
    # never saw it. Keep it that way.
    op.execute("UPDATE action_plan_items SET parent_only = true WHERE kind = 'tool' AND tool_id IS NULL")


def downgrade() -> None:
    op.drop_column('action_plan_items', 'parent_only')
