import uuid
from datetime import datetime, date
from sqlalchemy import Boolean, Integer, String, Text, Date, DateTime, ForeignKey, ARRAY, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class SessionNote(Base):
    __tablename__ = "session_notes"

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
    practitioner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("practitioner_profiles.id"), nullable=False
    )
    # Legacy single categorization; kept nullable for back-compat/rollback.
    # New notes use `participant` + `tags` instead.
    session_type: Mapped[str | None] = mapped_column(String, nullable=True)
    # Who was in the session: any of 'parent', 'patient'. A joint session has both.
    participants: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default=text("'{}'")
    )
    # Flexible multi-tags (preset + custom), e.g. ['Initial', 'Consult'].
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default=text("'{}'")
    )
    session_date: Mapped[date] = mapped_column(
        Date, nullable=False, server_default=text("CURRENT_DATE")
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # A note Float wrote from a recorded session stays a draft until the clinician approves it.
    # docs/plans/session-recording.md
    is_draft: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    #: typed | recording
    source: Mapped[str] = mapped_column(String, nullable=False, default="typed", server_default=text("'typed'"))
    #: Who said what: [{"speaker": "1:2", "text": "..."}], in order. The recording is not kept.
    transcript: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    #: Speaker key -> the name shown, e.g. {"1:1": "Clinician"}. The clinician can change these.
    speaker_names: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        onupdate=datetime.now
    )


class SessionRecording(Base):
    """A session being recorded on the clinician's phone, until it becomes a draft note.

    The audio is uploaded in pieces to Google Cloud Storage, joined, transcribed by Google with the
    speakers separated, written up by Claude, and deleted. docs/plans/session-recording.md
    """
    __tablename__ = "session_recordings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()"))
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    practitioner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("practitioner_profiles.id"), nullable=False)
    #: recording | stopped | transcribing | done | failed
    status: Mapped[str] = mapped_column(String, nullable=False, default="recording")
    participants: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, server_default=text("'{}'"))
    content_type: Mapped[str] = mapped_column(String, nullable=False)
    #: Stretches of recording: a new one starts after "tap to carry on".
    segments: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default=text("1"))
    #: One per segment: {"segment", "object", "operation", "turns"}. Turns fill in as Google finishes.
    jobs: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    session_note_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("session_notes.id", ondelete="SET NULL"), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    stopped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

