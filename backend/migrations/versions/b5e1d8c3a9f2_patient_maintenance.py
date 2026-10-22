"""patient maintenance

A clinician moves a patient into maintenance by hand, the same way they close one. For now this only
changes the patient's phase on the patient list (Peter, 2026-10-21, issue #53).

Not destructive: two nullable columns.

Revision ID: b5e1d8c3a9f2
Revises: a4c9e2f7b1d3
Create Date: 2026-10-21

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'b5e1d8c3a9f2'
down_revision = 'a4c9e2f7b1d3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('patient_profiles',
                  sa.Column('maintenance_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('patient_profiles',
                  sa.Column('maintenance_by_practitioner_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_patient_maintenance_by', 'patient_profiles', 'practitioner_profiles',
                          ['maintenance_by_practitioner_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_patient_maintenance_by', 'patient_profiles', type_='foreignkey')
    op.drop_column('patient_profiles', 'maintenance_by_practitioner_id')
    op.drop_column('patient_profiles', 'maintenance_at')
