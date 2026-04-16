"""add password reset token fields to users

Revision ID: 2408a7d29380
Revises: a1b2c3d4e5f6
Create Date: 2026-04-15 14:49:20.567611

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2408a7d29380'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('password_reset_token', sa.String(), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column('password_reset_expires', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('users', 'password_reset_expires')
    op.drop_column('users', 'password_reset_token')
