"""Recording a session into Session Notes.

A table for a recording in progress, draft notes with a transcript, and the patient's recording
consent. docs/plans/session-recording.md. Adds only; nothing is dropped.

Revision ID: a9d3f0c2b715
Revises: f2c8d5a7b314
Create Date: 2026-09-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "a9d3f0c2b715"
down_revision = "f2c8d5a7b314"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("session_notes", sa.Column("is_draft", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("session_notes", sa.Column("source", sa.String(), nullable=False, server_default="typed"))
    op.add_column("session_notes", sa.Column("transcript", postgresql.JSONB(), nullable=True))
    op.add_column("session_notes", sa.Column("speaker_names", postgresql.JSONB(), nullable=True))

    op.add_column("patient_profiles", sa.Column("recording_consent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("patient_profiles", sa.Column("recording_consent_by", sa.String(), nullable=True))
    op.add_column("patient_profiles", sa.Column("recording_consent_practitioner_id", sa.UUID(), nullable=True))
    op.create_foreign_key("fk_patient_profiles_recording_consent_practitioner", "patient_profiles",
                          "practitioner_profiles", ["recording_consent_practitioner_id"], ["id"])

    op.create_table(
        "session_recordings",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("patient_id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("practitioner_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("participants", postgresql.ARRAY(sa.String()), server_default=sa.text("'{}'"), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("segments", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("jobs", postgresql.JSONB(), nullable=True),
        sa.Column("error", sa.String(), nullable=True),
        sa.Column("session_note_id", sa.UUID(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("stopped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["patient_id"], ["patient_profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["practitioner_id"], ["practitioner_profiles.id"]),
        sa.ForeignKeyConstraint(["session_note_id"], ["session_notes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_session_recordings_patient_id", "session_recordings", ["patient_id"])


def downgrade() -> None:
    op.drop_index("ix_session_recordings_patient_id", table_name="session_recordings")
    op.drop_table("session_recordings")
    op.drop_constraint("fk_patient_profiles_recording_consent_practitioner", "patient_profiles", type_="foreignkey")
    op.drop_column("patient_profiles", "recording_consent_practitioner_id")
    op.drop_column("patient_profiles", "recording_consent_by")
    op.drop_column("patient_profiles", "recording_consent_at")
    op.drop_column("session_notes", "speaker_names")
    op.drop_column("session_notes", "transcript")
    op.drop_column("session_notes", "source")
    op.drop_column("session_notes", "is_draft")
