import uuid
from datetime import datetime, date
from sqlalchemy import String, Text, Date, DateTime, ForeignKey, ARRAY, text
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
    # Who the session was with: 'parent' | 'patient' (nullable for legacy rows).
    participant: Mapped[str | None] = mapped_column(String, nullable=True)
    # Flexible multi-tags (preset + custom), e.g. ['Initial', 'Consult'].
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default=text("'{}'")
    )
    session_date: Mapped[date] = mapped_column(
        Date, nullable=False, server_default=text("CURRENT_DATE")
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        onupdate=datetime.now
    )
