"""A session note can record more than one participant

A session can have the parent and the child in the room together. The old
single `participant` column could not say that. Replaced with an array; the
existing single value is carried over as a one-item list.

Revision ID: a1c7f0e39b52
Revises: c8b3e51d97a4
Create Date: 2026-09-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'a1c7f0e39b52'
down_revision = 'c8b3e51d97a4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'session_notes',
        sa.Column(
            'participants',
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )
    op.execute(
        "UPDATE session_notes SET participants = ARRAY[participant] "
        "WHERE participant IS NOT NULL"
    )
    op.drop_column('session_notes', 'participant')


def downgrade() -> None:
    op.add_column(
        'session_notes',
        sa.Column('participant', sa.String(), nullable=True),
    )
    op.execute(
        "UPDATE session_notes SET participant = participants[1] "
        "WHERE array_length(participants, 1) >= 1"
    )
    op.drop_column('session_notes', 'participants')
