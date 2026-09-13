import uuid
from datetime import datetime, date
from sqlalchemy import String, DateTime, Date, ForeignKey, text, Text, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class MonitoringForm(Base):
    __tablename__ = "monitoring_forms"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("patient_profiles.id"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String, nullable=False, default="pending"
    )
    access_token: Mapped[str] = mapped_column(
        String, nullable=False, unique=True
    )
    access_token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    parent_phone: Mapped[str | None] = mapped_column(String, nullable=True)
    # Recordings and write-ups today. The form's link needs no sign-in and they call paid services,
    # so a leaked link cannot run up the cost. docs/plans/monitoring-just-say-it.md
    capture_day: Mapped[date | None] = mapped_column(Date, nullable=True)
    capture_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    # The evening email during the monitoring week: the address the form was sent to (only that one,
    # never the patient record's, which may be another parent's), where the parent lives, the last
    # day it went, and whether they turned it off.
    parent_email: Mapped[str | None] = mapped_column(String, nullable=True)
    parent_timezone: Mapped[str | None] = mapped_column(String, nullable=True)
    evening_email_sent_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    reminders_off_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )


class MonitoringEntry(Base):
    __tablename__ = "monitoring_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    monitoring_form_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("monitoring_forms.id"), nullable=False
    )
    entry_date: Mapped[date] = mapped_column(
        Date, nullable=False, server_default=text("CURRENT_DATE")
    )
    situation: Mapped[str | None] = mapped_column(Text, nullable=True)
    child_behavior_observed: Mapped[str | None] = mapped_column(Text, nullable=True)
    parent_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    fear_thermometer: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_draft: Mapped[bool] = mapped_column(Boolean, default=False)
    # What the parent said or typed, when Float wrote the observation up from it. The recording
    # itself is never kept (Peter, 2026-09-11).
    parent_words: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: form | voice | note
    captured_by: Mapped[str] = mapped_column(String, nullable=False, default="form", server_default=text("'form'"))
    #: The recording or quick note it was written up from. Deleting that deletes this.
    note_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("monitoring_notes.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )


class MonitoringNote(Base):
    """What a parent said out loud or typed as a quick note, in their words.

    Peter, 2026-09-12: the parent just talks, and it goes; they are not shown a form to check. Float
    writes it up as observations afterwards, which the clinician sees with these words beside them.
    The recording itself is never kept. docs/plans/monitoring-just-say-it.md
    """
    __tablename__ = "monitoring_notes"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    monitoring_form_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("monitoring_forms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    words: Mapped[str] = mapped_column(Text, nullable=False)
    #: voice | note
    captured_by: Mapped[str] = mapped_column(String, nullable=False)
    #: The parent's own date when they said it, so "this morning" is their morning.
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    #: The one tap after recording: how upset the child was. Fills any moment the parent gave no
    #: number for; a number they said stays.
    fear_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    written_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )
