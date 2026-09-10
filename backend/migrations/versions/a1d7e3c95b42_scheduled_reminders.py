"""Reminders: where each person lives, their off switch, and what was sent

The first scheduled jobs (docs/plans/scheduled-jobs.md). users gains the time zone the child and
parent apps send, and the moment reminder emails were turned off. reminders_sent records every
reminder, which keeps one from going twice and a person to one a day.

Additive: two nullable columns and a new table.

Revision ID: a1d7e3c95b42
Revises: f6c1d8a24e90
Create Date: 2026-09-10
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1d7e3c95b42'
down_revision = 'f6c1d8a24e90'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('timezone', sa.String(), nullable=True))
    op.add_column('users', sa.Column('reminder_emails_off_at', sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        'reminders_sent',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('ref', sa.String(), nullable=False),
        sa.Column('local_date', sa.Date(), nullable=False),
        sa.Column('sent_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'kind', 'ref', name='uq_reminder_once'),
    )
    op.create_index('ix_reminders_sent_user_day', 'reminders_sent', ['user_id', 'local_date'])


def downgrade() -> None:
    op.drop_index('ix_reminders_sent_user_day', table_name='reminders_sent')
    op.drop_table('reminders_sent')
    op.drop_column('users', 'reminder_emails_off_at')
    op.drop_column('users', 'timezone')
