"""patient access log

Who opened which patient record, and when. The grants table controls who MAY; this records who DID.

Not destructive: one new table.

Plan: docs/plans/patient-access-log.md

Revision ID: d9a4f60b2e15
Revises: b7c2e94f13a8
Create Date: 2026-08-29

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'd9a4f60b2e15'
down_revision = 'b7c2e94f13a8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'patient_access_log',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('patient_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('practitioner_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('method', sa.String(), nullable=True),
        sa.Column('path', sa.String(), nullable=True),
        sa.Column('via', sa.String(), nullable=False),
        sa.Column('occurred_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['patient_id'], ['patient_profiles.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['practitioner_id'], ['practitioner_profiles.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_patient_access_log_patient', 'patient_access_log', ['patient_id', 'occurred_at'])
    op.create_index('ix_patient_access_log_user', 'patient_access_log', ['user_id', 'occurred_at'])


def downgrade() -> None:
    op.drop_index('ix_patient_access_log_user', table_name='patient_access_log')
    op.drop_index('ix_patient_access_log_patient', table_name='patient_access_log')
    op.drop_table('patient_access_log')
