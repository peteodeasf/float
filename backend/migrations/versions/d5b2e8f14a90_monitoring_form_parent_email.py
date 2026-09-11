"""The address a monitoring form was sent to.

The evening email during the monitoring week goes there and nowhere else. Found by the security
review, 2026-09-11: the patient record's address may be a different parent's.
docs/plans/monitoring-just-say-it.md. Adds a column only; nothing is dropped.

Revision ID: d5b2e8f14a90
Revises: c3f9a2d71e05
Create Date: 2026-09-11
"""
from alembic import op
import sqlalchemy as sa


revision = "d5b2e8f14a90"
down_revision = "c3f9a2d71e05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("monitoring_forms", sa.Column("parent_email", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("monitoring_forms", "parent_email")
