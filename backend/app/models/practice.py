"""Practice onboarding: office managers, accepted agreements, and access requests.

docs/plans/clinician-practice-onboarding.md
"""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Integer, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class PracticeManagerProfile(Base):
    """Someone who runs a practice but is not a clinician. They never have a PractitionerProfile,
    which is what keeps them out of every clinician endpoint."""
    __tablename__ = "practice_manager_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    phone_number: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class AgreementAcceptance(Base):
    """One person accepting one version of the terms or the BAA. Never updated: a new version adds
    a row, so who agreed to what, and when, stays answerable."""
    __tablename__ = "agreement_acceptances"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Kept if the user is later deleted, so the practice's BAA record survives them.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    user_email: Mapped[str] = mapped_column(String, nullable=False)
    document: Mapped[str] = mapped_column(String, nullable=False)  # "terms" or "baa"
    version: Mapped[str] = mapped_column(String, nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class AccessRequest(Base):
    """A practice asking to use Float, from the public Request access page. Not the waitlist."""
    __tablename__ = "access_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False, index=True)
    role: Mapped[str] = mapped_column(String, nullable=False)  # "clinician" or "practice_manager"
    credentials: Mapped[str | None] = mapped_column(String, nullable=True)
    practice_name: Mapped[str] = mapped_column(String, nullable=False)
    state: Mapped[str] = mapped_column(String, nullable=False)
    practice_size: Mapped[int] = mapped_column(Integer, nullable=False)
    # new, approved or declined
    status: Mapped[str] = mapped_column(String, nullable=False, default="new", server_default="new")
    ip_address: Mapped[str | None] = mapped_column(String, nullable=True)
    reviewed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
