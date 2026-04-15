"""add teen invitation fields

Revision ID: a1b2c3d4e5f6
Revises: fe555be26e27
Create Date: 2026-04-15 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'fe555be26e27'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('patient_profiles', sa.Column('teen_email', sa.String(), nullable=True))
    op.add_column('patient_profiles', sa.Column('teen_invited_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        'users',
        sa.Column(
            'must_change_password',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'must_change_password')
    op.drop_column('patient_profiles', 'teen_invited_at')
    op.drop_column('patient_profiles', 'teen_email')
