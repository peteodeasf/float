"""patient_profiles: add child-connect consent fields

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-08-10

Adds parental consent to connect the child into the app:
`child_connect_consent_at` (timestamp) + `consent_source` ('parent_form' |
'clinician'). Nullable/additive — existing patients have no consent recorded
(which blocks the teen invite until it's granted).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f5a6b7c8d9e0'
down_revision: Union[str, None] = 'e4f5a6b7c8d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'patient_profiles',
        sa.Column('child_connect_consent_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'patient_profiles',
        sa.Column('consent_source', sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('patient_profiles', 'consent_source')
    op.drop_column('patient_profiles', 'child_connect_consent_at')
