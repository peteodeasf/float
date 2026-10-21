"""Teen co-design sessions and who signed up for them. docs/plans/codesign-signup.md

Not patients: nothing here links to a patient, family or clinician record.
"""
import uuid
from datetime import datetime
from sqlalchemy import Boolean, String, Integer, DateTime, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class CodesignSession(Base):
    __tablename__ = "codesign_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4,
                                          server_default=text("gen_random_uuid()"))
    week: Mapped[int] = mapped_column(Integer, nullable=False)  # 1 or 2
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    seats: Mapped[int] = mapped_column(Integer, nullable=False)


class CodesignSignup(Base):
    __tablename__ = "codesign_signups"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4,
                                          server_default=text("gen_random_uuid()"))
    teen_first_name: Mapped[str] = mapped_column(String, nullable=False)
    teen_last_name: Mapped[str] = mapped_column(String, nullable=False)
    teen_age: Mapped[int] = mapped_column(Integer, nullable=False)
    teen_email: Mapped[str] = mapped_column(String, nullable=False)
    parent_name: Mapped[str] = mapped_column(String, nullable=False)
    parent_email: Mapped[str] = mapped_column(String, nullable=False)
    session1_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("codesign_sessions.id"), nullable=False)
    session2_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("codesign_sessions.id"), nullable=False)
    # Only a hash of the permission link's token is kept, so the database alone cannot give it.
    permission_token_hash: Mapped[str] = mapped_column(String, nullable=False, unique=True)
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
