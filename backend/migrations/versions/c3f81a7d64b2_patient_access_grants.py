"""patient access grants

Clinician access to a patient becomes explicit. Until now any clinician could open any patient in
their own institution, because the lookup filtered on organization_id and nothing else.

The backfill gives each patient's primary practitioner a grant, so nobody loses access to a patient
they were already working with. Every patient in production has a primary_practitioner_id (35
patients, zero nulls), but the INSERT skips nulls anyway rather than assuming that holds forever.

Not destructive: adds one table, changes no existing column and drops nothing.

Plan: docs/plans/clinician-patient-access-grants.md

Revision ID: c3f81a7d64b2
Revises: d4c7b1e8f309
Create Date: 2026-08-28

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'c3f81a7d64b2'
down_revision = 'd4c7b1e8f309'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'patient_access_grants',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'),
                  nullable=False),
        sa.Column('patient_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('practitioner_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('granted_by_practitioner_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('revoked_by_practitioner_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'),
                  nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['patient_id'], ['patient_profiles.id'], ),
        sa.ForeignKeyConstraint(['practitioner_id'], ['practitioner_profiles.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.ForeignKeyConstraint(['granted_by_practitioner_id'], ['practitioner_profiles.id'], ),
        sa.ForeignKeyConstraint(['revoked_by_practitioner_id'], ['practitioner_profiles.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    # One live grant per pair, while still allowing a grant to be given again after a revoke.
    op.create_index(
        'uq_patient_access_grants_live',
        'patient_access_grants',
        ['patient_id', 'practitioner_id'],
        unique=True,
        postgresql_where=sa.text('revoked_at IS NULL'),
    )
    op.create_index(
        'ix_patient_access_grants_practitioner',
        'patient_access_grants',
        ['practitioner_id'],
    )

    # Backfill: the primary practitioner keeps the access they already had.
    # granted_by is left null, which is how a backfilled grant is told apart from one a person made.
    op.execute("""
        INSERT INTO patient_access_grants (patient_id, practitioner_id, organization_id)
        SELECT p.id, p.primary_practitioner_id, p.organization_id
        FROM patient_profiles p
        WHERE p.primary_practitioner_id IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_index('ix_patient_access_grants_practitioner', table_name='patient_access_grants')
    op.drop_index('uq_patient_access_grants_live', table_name='patient_access_grants')
    op.drop_table('patient_access_grants')
