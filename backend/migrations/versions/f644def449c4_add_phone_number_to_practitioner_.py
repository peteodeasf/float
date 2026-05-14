"""add phone_number to practitioner_profiles and sender_type to messages

Revision ID: f644def449c4
Revises: 663f1992aadc
Create Date: 2026-05-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f644def449c4'
down_revision: Union[str, None] = '663f1992aadc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('practitioner_profiles', sa.Column('phone_number', sa.String(), nullable=True))
    op.add_column('messages', sa.Column('sender_type', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('messages', 'sender_type')
    op.drop_column('practitioner_profiles', 'phone_number')
