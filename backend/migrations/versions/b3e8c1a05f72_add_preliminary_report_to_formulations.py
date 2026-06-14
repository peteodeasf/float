"""add preliminary_report to clinical_formulations

Revision ID: b3e8c1a05f72
Revises: 9f3a1c7e2b50
Create Date: 2026-06-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b3e8c1a05f72'
down_revision: Union[str, None] = '9f3a1c7e2b50'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'clinical_formulations',
        sa.Column('preliminary_report', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('clinical_formulations', 'preliminary_report')
