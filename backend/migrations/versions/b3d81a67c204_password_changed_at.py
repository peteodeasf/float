"""Changing a password ends every other session

Refresh tokens are stateless and last a week, so a password change did nothing to a session
someone else already had. Recording when the password changed lets every token issued before
that moment be refused.

Nothing is dropped and nothing is backfilled: null means "has never changed their password",
under which no token is refused.

Revision ID: b3d81a67c204
Revises: a1c7f0e39b52
Create Date: 2026-09-01
"""
from alembic import op
import sqlalchemy as sa

revision = 'b3d81a67c204'
down_revision = 'a1c7f0e39b52'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('password_changed_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('users', 'password_changed_at')
