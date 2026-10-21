"""Co-design: the real permission form, and 6 seats per session

docs/plans/codesign-signup.md. Peter, 2026-10-21: the permission form with the teen's agreement,
and 6 seats per session instead of 8.

Adds nullable columns to codesign_signups for every answer on the form. Changes the seats on the
existing codesign_sessions rows from 8 to 6. Drops nothing, and removes no sign-up.

Revision ID: b8e3d1f6c2a9
Revises: a4c9e2f7b1d3
Create Date: 2026-10-21
"""
from alembic import op
import sqlalchemy as sa

revision = "b8e3d1f6c2a9"
down_revision = "a4c9e2f7b1d3"
branch_labels = None
depends_on = None

COLUMNS = [
    ("form_submitted_at", sa.DateTime(timezone=True)),
    ("form_version", sa.String()),
    ("parent_consents", sa.Boolean()),
    ("parent_allows_recording", sa.Boolean()),
    ("parent_allows_quotes", sa.Boolean()),
    ("parent_confirms_guardian", sa.Boolean()),
    ("parent_signed_name", sa.String()),
    ("parent_relationship", sa.String()),
    ("parent_phone", sa.String()),
    ("parent_contact_email", sa.String()),
    ("parent_session_phone", sa.String()),
    ("teen_consents", sa.Boolean()),
    ("teen_allows_recording", sa.Boolean()),
    ("teen_signed_name", sa.String()),
    ("teen_completed_by", sa.String()),
]


def upgrade() -> None:
    for name, type_ in COLUMNS:
        op.add_column("codesign_signups", sa.Column(name, type_, nullable=True))
    op.execute("UPDATE codesign_sessions SET seats = 6")


def downgrade() -> None:
    op.execute("UPDATE codesign_sessions SET seats = 8")
    for name, _ in reversed(COLUMNS):
        op.drop_column("codesign_signups", name)
