"""One-time setup links, replacing emailed temporary passwords for new clinicians.

docs/plans/clinician-practice-onboarding.md. Adds a table; nothing is dropped.

Revision ID: b3e7c1d9a2f4
Revises: a9d3f0c2b715
Create Date: 2026-09-16
"""
from alembic import op
import sqlalchemy as sa


revision = "b3e7c1d9a2f4"
down_revision = "a9d3f0c2b715"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "setup_links",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("purpose", sa.String(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_setup_links_user_id", "setup_links", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_setup_links_user_id", table_name="setup_links")
    op.drop_table("setup_links")
