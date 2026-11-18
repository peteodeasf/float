"""Clinician feedback, sent on to GitHub as issues

docs/plans/clinician-feedback-link.md. Additive: a new table, nothing existing changes.

Revision ID: a3f9c2d7e8b1
Revises: d9e4b7a2c1f5
Create Date: 2026-11-18
"""
from alembic import op
import sqlalchemy as sa

revision = 'a3f9c2d7e8b1'
down_revision = 'd9e4b7a2c1f5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'clinician_feedback',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('page', sa.String(), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('github_issue_number', sa.Integer(), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('send_attempts', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    # The 15-minute job looks only for rows not yet on GitHub.
    op.create_index(
        'ix_clinician_feedback_unsent', 'clinician_feedback', ['created_at'],
        postgresql_where=sa.text('github_issue_number IS NULL'),
    )


def downgrade() -> None:
    op.drop_index('ix_clinician_feedback_unsent', table_name='clinician_feedback')
    op.drop_table('clinician_feedback')
