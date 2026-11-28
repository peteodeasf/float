"""The child's reason when they mark an exposure too hard, kept on the exposure.

Until now it only went to the clinician as a chat message. The Progress tab shows it beside the
attempt. docs/plans/progress-tab-action-plan.md

Additive: one nullable column. Older "too hard" rows have no reason.

Revision ID: e7b3c9d1f2a4
Revises: d5f9b2c7e4a1
Create Date: 2026-11-28
"""
from alembic import op
import sqlalchemy as sa

revision = 'e7b3c9d1f2a4'
down_revision = 'd5f9b2c7e4a1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('experiments', sa.Column('too_hard_reason', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('experiments', 'too_hard_reason')
