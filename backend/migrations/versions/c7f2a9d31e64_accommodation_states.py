"""Where each accommodation has got to: not started, started or stopped

Replaces the "active" every accommodation was given at creation and nothing ever read. The current
weekly focus becomes started and every other row not started. Test data only; nothing is dropped.
docs/plans/accommodation-states.md

Revision ID: c7f2a9d31e64
Revises: b91e4d7c2a58
Create Date: 2026-09-10
"""
from alembic import op

revision = 'c7f2a9d31e64'
down_revision = 'b91e4d7c2a58'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE accommodation_behaviors "
        "SET status = CASE WHEN is_weekly_focus THEN 'started' ELSE 'not_started' END"
    )
    op.alter_column('accommodation_behaviors', 'status', server_default='not_started')


def downgrade() -> None:
    op.alter_column('accommodation_behaviors', 'status', server_default=None)
    op.execute("UPDATE accommodation_behaviors SET status = 'active'")
