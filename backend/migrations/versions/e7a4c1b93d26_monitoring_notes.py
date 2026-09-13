"""Monitoring notes: what a parent said or typed, which Float writes up without asking them to check.

Peter, 2026-09-12. docs/plans/monitoring-just-say-it.md. Adds a table and a column; nothing is
dropped.

Revision ID: e7a4c1b93d26
Revises: d5b2e8f14a90
Create Date: 2026-09-12
"""
from alembic import op
import sqlalchemy as sa


revision = "e7a4c1b93d26"
down_revision = "d5b2e8f14a90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "monitoring_notes",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("monitoring_form_id", sa.UUID(), nullable=False),
        sa.Column("words", sa.Text(), nullable=False),
        sa.Column("captured_by", sa.String(), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("fear_level", sa.Integer(), nullable=True),
        sa.Column("written_up_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["monitoring_form_id"], ["monitoring_forms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_monitoring_notes_monitoring_form_id", "monitoring_notes", ["monitoring_form_id"])
    op.add_column("monitoring_entries", sa.Column("note_id", sa.UUID(), nullable=True))
    op.create_foreign_key("fk_monitoring_entries_note_id", "monitoring_entries", "monitoring_notes",
                          ["note_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_monitoring_entries_note_id", "monitoring_entries", ["note_id"])


def downgrade() -> None:
    op.drop_index("ix_monitoring_entries_note_id", table_name="monitoring_entries")
    op.drop_constraint("fk_monitoring_entries_note_id", "monitoring_entries", type_="foreignkey")
    op.drop_column("monitoring_entries", "note_id")
    op.drop_index("ix_monitoring_notes_monitoring_form_id", table_name="monitoring_notes")
    op.drop_table("monitoring_notes")
