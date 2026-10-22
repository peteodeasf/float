"""merge maintenance and codesign permission heads

Revision ID: dcb15663ca0d
Revises: b5e1d8c3a9f2, b8e3d1f6c2a9
Create Date: 2026-10-22 08:16:36.426498

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dcb15663ca0d'
down_revision: Union[str, None] = ('b5e1d8c3a9f2', 'b8e3d1f6c2a9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
