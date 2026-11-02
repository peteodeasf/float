"""Co-design: college students, with their own sessions and sign-ups.

Peter, 2026-11-02: separate sign-ups for high school (13 to 17, a parent's permission) and college
(18 to 20, who agree for themselves). docs/plans/codesign-signup.md ("College students")

Additive. Every existing session and sign-up becomes high school, and nothing is dropped:
- `audience` on both tables, 'high_school' for every existing row.
- The parent, second date and permission link columns become nullable, because a college sign-up
  has none. A check keeps them required for high school, as before.
- Four columns for the college agreement: both boxes, when, and which wording.
- Composite keys so a sign-up can only be on a session of its own group.
- Three college sessions: Tue Nov 10, Wed Nov 11, Thu Nov 12 at 12pm Eastern (17:00 UTC), 6 seats each.

The downgrade deletes the college sign-ups and sessions, then undoes the rest.

Revision ID: d9e4b7a2c1f5
Revises: c6f2a9e4d1b7
Create Date: 2026-11-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d9e4b7a2c1f5"
down_revision: Union[str, None] = "c6f2a9e4d1b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLLEGE_SESSIONS = ["2026-11-10 17:00:00+00", "2026-11-11 17:00:00+00", "2026-11-12 17:00:00+00"]
NOW_NULLABLE = [("parent_name", sa.String()), ("parent_email", sa.String()),
                ("session2_id", sa.UUID()), ("permission_token_hash", sa.String())]


def upgrade() -> None:
    for table in ("codesign_sessions", "codesign_signups"):
        op.add_column(table, sa.Column("audience", sa.String(), nullable=False,
                                       server_default="high_school"))
        op.create_check_constraint(f"ck_{table}_audience", table,
                                   "audience IN ('high_school', 'college')")
    op.create_unique_constraint("uq_codesign_sessions_id_audience", "codesign_sessions", ["id", "audience"])

    for column, type_ in NOW_NULLABLE:
        op.alter_column("codesign_signups", column, existing_type=type_, nullable=True)
    op.add_column("codesign_signups", sa.Column("agrees_to_recording", sa.Boolean(), nullable=True))
    op.add_column("codesign_signups", sa.Column("agrees_to_take_part", sa.Boolean(), nullable=True))
    op.add_column("codesign_signups", sa.Column("agreed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("codesign_signups", sa.Column("agreement_version", sa.String(), nullable=True))

    for n in (1, 2):
        op.create_foreign_key(f"fk_codesign_signups_session{n}_audience", "codesign_signups",
                              "codesign_sessions", [f"session{n}_id", "audience"], ["id", "audience"])
    op.create_check_constraint(
        "ck_codesign_signups_high_school", "codesign_signups",
        "audience <> 'high_school' OR (session2_id IS NOT NULL AND parent_name IS NOT NULL "
        "AND parent_email IS NOT NULL AND permission_token_hash IS NOT NULL)")
    op.create_check_constraint(
        "ck_codesign_signups_college", "codesign_signups",
        "audience <> 'college' OR (session2_id IS NULL AND parent_name IS NULL AND parent_email IS NULL "
        "AND agrees_to_recording IS TRUE AND agrees_to_take_part IS TRUE AND agreed_at IS NOT NULL "
        "AND agreement_version IS NOT NULL)")

    # Constants above, written in directly so the migration also renders offline.
    for starts_at in COLLEGE_SESSIONS:
        op.execute("INSERT INTO codesign_sessions (audience, week, starts_at, seats) "
                   f"VALUES ('college', 1, '{starts_at}', 6)")


def downgrade() -> None:
    op.execute("DELETE FROM codesign_signups WHERE audience = 'college'")
    op.execute("DELETE FROM codesign_sessions WHERE audience = 'college'")
    op.drop_constraint("ck_codesign_signups_college", "codesign_signups", type_="check")
    op.drop_constraint("ck_codesign_signups_high_school", "codesign_signups", type_="check")
    for n in (1, 2):
        op.drop_constraint(f"fk_codesign_signups_session{n}_audience", "codesign_signups", type_="foreignkey")
    for column in ("agreement_version", "agreed_at", "agrees_to_take_part", "agrees_to_recording"):
        op.drop_column("codesign_signups", column)
    for column, type_ in NOW_NULLABLE:
        op.alter_column("codesign_signups", column, existing_type=type_, nullable=False)
    op.drop_constraint("uq_codesign_sessions_id_audience", "codesign_sessions", type_="unique")
    for table in ("codesign_signups", "codesign_sessions"):
        op.drop_constraint(f"ck_{table}_audience", table, type_="check")
        op.drop_column(table, "audience")
