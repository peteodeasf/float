"""close a patient

Treatment finished. Set by a clinician and reversible. A closed patient keeps everything and the
clinician can still read all of it; what closing stops is the child's app and the parent's app.

Not destructive: two nullable columns.

Plan: docs/plans/patient-list-phases.md

Revision ID: c8b3e51d97a4
Revises: f2c7a13e845b
Create Date: 2026-08-31

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'c8b3e51d97a4'
down_revision = 'f2c7a13e845b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('patient_profiles',
                  sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('patient_profiles',
                  sa.Column('closed_by_practitioner_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_patient_closed_by', 'patient_profiles', 'practitioner_profiles',
                          ['closed_by_practitioner_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_patient_closed_by', 'patient_profiles', type_='foreignkey')
    op.drop_column('patient_profiles', 'closed_by_practitioner_id')
    op.drop_column('patient_profiles', 'closed_at')
