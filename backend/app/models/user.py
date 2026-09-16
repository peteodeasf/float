import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Boolean, ForeignKey, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # Set when the password changes. Every token issued before this is refused — see
    # token_predates_password_change.
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    password_reset_token: Mapped[str | None] = mapped_column(String, nullable=True)
    password_reset_expires: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # The time zone of their phone or browser, sent by the child and parent apps when they open.
    # Reminders keep to 8am–8pm there; with none recorded, no reminder is sent.
    # docs/plans/scheduled-jobs.md
    timezone: Mapped[str | None] = mapped_column(String, nullable=True)
    # Set from the link at the bottom of every reminder email.
    reminder_emails_off_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Onboarding. What this person has done so far: the setup screens they have finished, and the
    # getting-started flags (opened the education, hid the checklist). A clinician or office
    # manager cannot use the app until setup_completed_at is set.
    # docs/plans/clinician-practice-onboarding.md
    onboarding_flags: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    setup_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Set when a practice admin removes them. The account stops working; nothing is deleted.
    deactivated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )


class UserRole(Base):
    __tablename__ = "user_roles"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(String, nullable=False)
    is_org_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )
