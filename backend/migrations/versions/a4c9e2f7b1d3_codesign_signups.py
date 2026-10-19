"""Teen co-design sign-ups: the six sessions and who signed up

docs/plans/codesign-signup.md. Peter, 2026-10-19: one date from each week, 12pm Eastern, a
parent's permission recorded by link. Seats per session are 8 until Peter gives a number.

Additive: two new tables and six session rows. Drops nothing.

Revision ID: a4c9e2f7b1d3
Revises: d7f2b4e9a1c6
Create Date: 2026-10-19
"""
from alembic import op
import sqlalchemy as sa

revision = "a4c9e2f7b1d3"
down_revision = "d7f2b4e9a1c6"
branch_labels = None
depends_on = None

# 12pm Eastern. Early November 2026 is still daylight time until Nov 1, then standard time (UTC-5),
# so every one of these is 17:00 UTC.
SESSIONS = [
    (1, "2026-11-03 17:00:00+00"),
    (1, "2026-11-04 17:00:00+00"),
    (1, "2026-11-05 17:00:00+00"),
    (2, "2026-11-10 17:00:00+00"),
    (2, "2026-11-11 17:00:00+00"),
    (2, "2026-11-12 17:00:00+00"),
]


def upgrade() -> None:
    op.create_table(
        "codesign_sessions",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("week", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("seats", sa.Integer(), nullable=False),
    )
    op.create_table(
        "codesign_signups",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("teen_first_name", sa.String(), nullable=False),
        sa.Column("teen_last_name", sa.String(), nullable=False),
        sa.Column("teen_age", sa.Integer(), nullable=False),
        sa.Column("teen_email", sa.String(), nullable=False),
        sa.Column("parent_name", sa.String(), nullable=False),
        sa.Column("parent_email", sa.String(), nullable=False),
        sa.Column("session1_id", sa.UUID(), sa.ForeignKey("codesign_sessions.id"), nullable=False),
        sa.Column("session2_id", sa.UUID(), sa.ForeignKey("codesign_sessions.id"), nullable=False),
        sa.Column("permission_token_hash", sa.String(), nullable=False, unique=True),
        sa.Column("permission_given_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("permission_given_by", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    # Constants above, written in directly so the migration also renders offline.
    for week, starts_at in SESSIONS:
        op.execute(f"INSERT INTO codesign_sessions (week, starts_at, seats) VALUES ({week}, '{starts_at}', 8)")


def downgrade() -> None:
    op.drop_table("codesign_signups")
    op.drop_table("codesign_sessions")
