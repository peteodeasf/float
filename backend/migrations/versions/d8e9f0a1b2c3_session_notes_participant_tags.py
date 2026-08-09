"""session_notes: add participant + tags, make session_type nullable

Revision ID: d8e9f0a1b2c3
Revises: c1d2e3f4a5b6
Create Date: 2026-08-09

Splits the single `session_type` categorization into `participant`
('parent' | 'patient') plus flexible `tags` (preset + custom). Existing rows
are backfilled from `session_type`, which is then made nullable (kept for
rollback safety; new notes leave it null).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8e9f0a1b2c3'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'session_notes',
        sa.Column('participant', sa.String(), nullable=True),
    )
    op.add_column(
        'session_notes',
        sa.Column('tags', sa.ARRAY(sa.String()), server_default='{}', nullable=False),
    )

    # Backfill from the legacy session_type value.
    op.execute("UPDATE session_notes SET participant = 'parent' WHERE session_type = 'consultation_1'")
    op.execute("UPDATE session_notes SET participant = 'patient' WHERE session_type IN ('consultation_2', 'weekly_session')")
    op.execute("UPDATE session_notes SET tags = ARRAY['Consult'] WHERE session_type IN ('consultation_1', 'consultation_2')")
    op.execute("UPDATE session_notes SET tags = ARRAY['Weekly'] WHERE session_type = 'weekly_session'")

    # session_type is no longer required for new notes.
    op.alter_column('session_notes', 'session_type', existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    # Restore NOT NULL on session_type; give new (null) rows a placeholder first.
    op.execute("UPDATE session_notes SET session_type = 'other' WHERE session_type IS NULL")
    op.alter_column('session_notes', 'session_type', existing_type=sa.String(), nullable=False)
    op.drop_column('session_notes', 'tags')
    op.drop_column('session_notes', 'participant')
