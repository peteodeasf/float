"""Practice onboarding: practice status, setup progress, office managers, agreements, access requests.

docs/plans/clinician-practice-onboarding.md. Adds only; nothing is dropped. Every existing user is
marked as having finished setup and every existing practice as active, so nobody already using
Float is sent through setup.

Revision ID: c4f8d2e1b7a3
Revises: b3e7c1d9a2f4
Create Date: 2026-09-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "c4f8d2e1b7a3"
down_revision = "b3e7c1d9a2f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("status", sa.String(), nullable=False, server_default="active"))
    op.add_column("organizations", sa.Column("state", sa.String(), nullable=True))
    op.add_column("organizations", sa.Column("phone", sa.String(), nullable=True))
    op.add_column("organizations", sa.Column("size", sa.Integer(), nullable=True))
    op.add_column("organizations", sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column("users", sa.Column("onboarding_flags", postgresql.JSONB(), nullable=False,
                                     server_default=sa.text("'[]'::jsonb")))
    op.add_column("users", sa.Column("setup_completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE users SET setup_completed_at = now()")

    op.add_column("patient_access_grants", sa.Column("granted_by_user_id", sa.UUID(), nullable=True))
    op.create_foreign_key("fk_patient_access_grants_granted_by_user", "patient_access_grants",
                          "users", ["granted_by_user_id"], ["id"], ondelete="SET NULL")

    op.create_table(
        "practice_manager_profiles",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("phone_number", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )

    op.create_table(
        "agreement_acceptances",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("user_email", sa.String(), nullable=False),
        sa.Column("document", sa.String(), nullable=False),
        sa.Column("version", sa.String(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agreement_acceptances_organization_id", "agreement_acceptances", ["organization_id"])

    op.create_table(
        "access_requests",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("credentials", sa.String(), nullable=True),
        sa.Column("practice_name", sa.String(), nullable=False),
        sa.Column("state", sa.String(), nullable=False),
        sa.Column("practice_size", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="new"),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("reviewed_by_user_id", sa.UUID(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("organization_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_access_requests_email", "access_requests", ["email"])


def downgrade() -> None:
    op.drop_index("ix_access_requests_email", table_name="access_requests")
    op.drop_table("access_requests")
    op.drop_index("ix_agreement_acceptances_organization_id", table_name="agreement_acceptances")
    op.drop_table("agreement_acceptances")
    op.drop_table("practice_manager_profiles")
    op.drop_constraint("fk_patient_access_grants_granted_by_user", "patient_access_grants", type_="foreignkey")
    op.drop_column("patient_access_grants", "granted_by_user_id")
    op.drop_column("users", "deactivated_at")
    op.drop_column("users", "setup_completed_at")
    op.drop_column("users", "onboarding_flags")
    op.drop_column("organizations", "suspended_at")
    op.drop_column("organizations", "size")
    op.drop_column("organizations", "phone")
    op.drop_column("organizations", "state")
    op.drop_column("organizations", "status")
