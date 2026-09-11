"""Monitoring, just say it: the parent's own words, how an observation was captured, a daily limit
on recordings, and the evening email during the monitoring week.

docs/plans/monitoring-just-say-it.md. Adds columns only; nothing is dropped.

Revision ID: c3f9a2d71e05
Revises: b8e2f4a61c09
Create Date: 2026-09-11
"""
from alembic import op
import sqlalchemy as sa


revision = "c3f9a2d71e05"
down_revision = "b8e2f4a61c09"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("monitoring_entries", sa.Column("parent_words", sa.Text(), nullable=True))
    op.add_column("monitoring_entries", sa.Column("captured_by", sa.String(), nullable=False, server_default="form"))
    op.add_column("monitoring_forms", sa.Column("capture_day", sa.Date(), nullable=True))
    op.add_column("monitoring_forms", sa.Column("capture_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("monitoring_forms", sa.Column("parent_timezone", sa.String(), nullable=True))
    op.add_column("monitoring_forms", sa.Column("evening_email_sent_on", sa.Date(), nullable=True))
    op.add_column("monitoring_forms", sa.Column("reminders_off_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("monitoring_forms", "reminders_off_at")
    op.drop_column("monitoring_forms", "evening_email_sent_on")
    op.drop_column("monitoring_forms", "parent_timezone")
    op.drop_column("monitoring_forms", "capture_count")
    op.drop_column("monitoring_forms", "capture_day")
    op.drop_column("monitoring_entries", "captured_by")
    op.drop_column("monitoring_entries", "parent_words")
