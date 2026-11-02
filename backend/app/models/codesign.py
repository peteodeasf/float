"""Co-design sessions and who signed up for them. docs/plans/codesign-signup.md

Two groups, kept apart: high school (13 to 17, with a parent's permission) and college (18 to 20,
who agree for themselves). A sign-up can only be on a session of its own group; the database
refuses anything else.

Not patients: nothing here links to a patient, family or clinician record.
"""
import uuid
from datetime import datetime
from sqlalchemy import (Boolean, CheckConstraint, String, Integer, DateTime, ForeignKey,
                        ForeignKeyConstraint, UniqueConstraint, text)
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


HIGH_SCHOOL = "high_school"
COLLEGE = "college"


class CodesignSession(Base):
    __tablename__ = "codesign_sessions"
    __table_args__ = (
        CheckConstraint("audience IN ('high_school', 'college')", name="ck_codesign_sessions_audience"),
        # The target of the sign-ups' (session, audience) keys below.
        UniqueConstraint("id", "audience", name="uq_codesign_sessions_id_audience"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4,
                                          server_default=text("gen_random_uuid()"))
    audience: Mapped[str] = mapped_column(String, nullable=False, server_default=HIGH_SCHOOL)
    week: Mapped[int] = mapped_column(Integer, nullable=False)  # 1 or 2; college is one session, week 1
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    seats: Mapped[int] = mapped_column(Integer, nullable=False)


class CodesignSignup(Base):
    __tablename__ = "codesign_signups"
    __table_args__ = (
        CheckConstraint("audience IN ('high_school', 'college')", name="ck_codesign_signups_audience"),
        # Each chosen session must be of the sign-up's own group, so an adult and a 13-to-17-year-old
        # are never on the same session.
        ForeignKeyConstraint(["session1_id", "audience"], ["codesign_sessions.id", "codesign_sessions.audience"],
                             name="fk_codesign_signups_session1_audience"),
        ForeignKeyConstraint(["session2_id", "audience"], ["codesign_sessions.id", "codesign_sessions.audience"],
                             name="fk_codesign_signups_session2_audience"),
        # High school: a parent, two dates and a permission link, as before college existed.
        CheckConstraint(
            "audience <> 'high_school' OR (session2_id IS NOT NULL AND parent_name IS NOT NULL "
            "AND parent_email IS NOT NULL AND permission_token_hash IS NOT NULL)",
            name="ck_codesign_signups_high_school"),
        # College: one date, no parent, and both boxes ticked, with when and which wording.
        CheckConstraint(
            "audience <> 'college' OR (session2_id IS NULL AND parent_name IS NULL AND parent_email IS NULL "
            "AND agrees_to_recording IS TRUE AND agrees_to_take_part IS TRUE AND agreed_at IS NOT NULL "
            "AND agreement_version IS NOT NULL)",
            name="ck_codesign_signups_college"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4,
                                          server_default=text("gen_random_uuid()"))
    audience: Mapped[str] = mapped_column(String, nullable=False, server_default=HIGH_SCHOOL)
    # The student, high school or college.
    teen_first_name: Mapped[str] = mapped_column(String, nullable=False)
    teen_last_name: Mapped[str] = mapped_column(String, nullable=False)
    teen_age: Mapped[int] = mapped_column(Integer, nullable=False)
    teen_email: Mapped[str] = mapped_column(String, nullable=False)
    # High school only, from here to teen_completed_by.
    parent_name: Mapped[str | None] = mapped_column(String, nullable=True)
    parent_email: Mapped[str | None] = mapped_column(String, nullable=True)
    # College uses session1_id for its one date.
    session1_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("codesign_sessions.id"), nullable=False)
    session2_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("codesign_sessions.id"), nullable=True)
    # Only a hash of the permission link's token is kept, so the database alone cannot give it.
    permission_token_hash: Mapped[str | None] = mapped_column(String, nullable=True, unique=True)
    # Confirmed: the parent and the teen both said yes to taking part. Kept meaning only that, so
    # the seat counts and lists that read it still work. permission_given_by is the parent's name.
    permission_given_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    permission_given_by: Mapped[str | None] = mapped_column(String, nullable=True)

    # The permission form (app/services/codesign_form.py), all null until it is sent. Sent with a no
    # from either side = declined: form_submitted_at set, permission_given_at null.
    form_submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    form_version: Mapped[str | None] = mapped_column(String, nullable=True)  # the wording agreed to
    parent_consents: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    parent_allows_recording: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # No longer asked (Peter, 2026-10-29). Kept for forms sent before then.
    parent_allows_quotes: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    parent_confirms_guardian: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    parent_signed_name: Mapped[str | None] = mapped_column(String, nullable=True)  # the signature
    parent_relationship: Mapped[str | None] = mapped_column(String, nullable=True)
    parent_phone: Mapped[str | None] = mapped_column(String, nullable=True)
    parent_contact_email: Mapped[str | None] = mapped_column(String, nullable=True)
    parent_session_phone: Mapped[str | None] = mapped_column(String, nullable=True)
    teen_consents: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    teen_allows_recording: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    teen_signed_name: Mapped[str | None] = mapped_column(String, nullable=True)  # the signature
    teen_completed_by: Mapped[str | None] = mapped_column(String, nullable=True)  # codesign_form.COMPLETED_BY

    # College only: the two boxes under the agreement (app/services/codesign_agreement.py), when they
    # were ticked, and which wording was shown. Both must be ticked to sign up.
    agrees_to_recording: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    agrees_to_take_part: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    agreed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    agreement_version: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
