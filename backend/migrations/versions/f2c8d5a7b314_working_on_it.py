"""The weekly focus becomes the state "Working on it".

Peter, 2026-09-13: the focus and Not started / Started / Stopped overlapped, so they are one setting.
Anything that was the focus is now Working on it (status `started`). The is_weekly_focus column is
kept and no longer read. docs/plans/parent-accommodations-like-the-ladder.md

Changes data only: an accommodation that was the focus but marked not started or stopped becomes
started. Nothing is dropped.

Revision ID: f2c8d5a7b314
Revises: e7a4c1b93d26
Create Date: 2026-09-13
"""
from alembic import op


revision = "f2c8d5a7b314"
down_revision = "e7a4c1b93d26"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE accommodation_behaviors SET status = 'started' WHERE is_weekly_focus")


def downgrade() -> None:
    pass
