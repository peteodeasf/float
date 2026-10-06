"""Two-parent monitoring: patient parent contacts + monitoring recipients

Peter, 2026-10-06: a child can have two parents on the monitoring form. Keep one form per child, hang
two recipients (each its own link token + label) off it, and stamp each entry with which recipient
wrote it. The patient carries two parent contacts (name + email) entered at add time.
docs/plans/two-parent-accounts.md (§5, §7).

Additive: two new tables + a nullable column on monitoring_entries + a backfill of each patient's
existing single parent into contact #1 (non-destructive).

Revision ID: f1a2c3d4e5b6
Revises: e2b9f4c17a06
Create Date: 2026-10-06
"""
from alembic import op
import sqlalchemy as sa

revision = "f1a2c3d4e5b6"
down_revision = "e2b9f4c17a06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "patient_parent_contacts",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("patient_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["patient_id"], ["patient_profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_patient_parent_contacts_patient_id", "patient_parent_contacts", ["patient_id"])

    op.create_table(
        "monitoring_recipients",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("monitoring_form_id", sa.UUID(), nullable=False),
        sa.Column("label", sa.String(), nullable=True),
        sa.Column("access_token", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["monitoring_form_id"], ["monitoring_forms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("access_token", name="uq_monitoring_recipients_token"),
    )
    op.create_index("ix_monitoring_recipients_form", "monitoring_recipients", ["monitoring_form_id"])

    op.add_column("monitoring_entries", sa.Column("recipient_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_monitoring_entries_recipient", "monitoring_entries", "monitoring_recipients",
        ["recipient_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_monitoring_entries_recipient", "monitoring_entries", ["recipient_id"])

    op.add_column("monitoring_notes", sa.Column("recipient_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_monitoring_notes_recipient", "monitoring_notes", "monitoring_recipients",
        ["recipient_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_monitoring_notes_recipient", "monitoring_notes", ["recipient_id"])

    # Backfill each patient's existing single parent into contact #1.
    op.execute(
        """
        INSERT INTO patient_parent_contacts (patient_id, name, email, position, created_at)
        SELECT id, parent_name, parent_email, 0, now()
        FROM patient_profiles
        WHERE parent_name IS NOT NULL OR parent_email IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_monitoring_notes_recipient", table_name="monitoring_notes")
    op.drop_constraint("fk_monitoring_notes_recipient", "monitoring_notes", type_="foreignkey")
    op.drop_column("monitoring_notes", "recipient_id")
    op.drop_index("ix_monitoring_entries_recipient", table_name="monitoring_entries")
    op.drop_constraint("fk_monitoring_entries_recipient", "monitoring_entries", type_="foreignkey")
    op.drop_column("monitoring_entries", "recipient_id")
    op.drop_index("ix_monitoring_recipients_form", table_name="monitoring_recipients")
    op.drop_table("monitoring_recipients")
    op.drop_index("ix_patient_parent_contacts_patient_id", table_name="patient_parent_contacts")
    op.drop_table("patient_parent_contacts")
