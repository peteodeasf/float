"""The parent's free-text "how did it go?" notes on accommodations

Peter, 2026-09-21: the parent app reorients around the child's work. Instead of structured parent
experiments, a parent writes a free note about how an accommodation went; the clinician sees it.
docs/plans/parent-app-around-childs-work.md

Additive: a new table.

Revision ID: b7e3f1a9c2d4
Revises: c4f8d2e1b7a3
Create Date: 2026-09-21
"""
from alembic import op
import sqlalchemy as sa

revision = "b7e3f1a9c2d4"
down_revision = "c4f8d2e1b7a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "accommodation_notes",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("treatment_plan_id", sa.UUID(), nullable=False),
        sa.Column("accommodation_id", sa.UUID(), nullable=False),
        sa.Column("parent_user_id", sa.UUID(), nullable=True),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["treatment_plan_id"], ["treatment_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["accommodation_id"], ["accommodation_behaviors.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_accommodation_notes_treatment_plan_id", "accommodation_notes", ["treatment_plan_id"])
    op.create_index("ix_accommodation_notes_accommodation_id", "accommodation_notes", ["accommodation_id"])


def downgrade() -> None:
    op.drop_index("ix_accommodation_notes_accommodation_id", table_name="accommodation_notes")
    op.drop_index("ix_accommodation_notes_treatment_plan_id", table_name="accommodation_notes")
    op.drop_table("accommodation_notes")
