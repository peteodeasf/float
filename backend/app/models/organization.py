import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Integer, JSON, text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    # setting_up until the person setting up the practice finishes, then active. Nobody in a
    # practice that is not active, or is suspended, can use the clinician app.
    # docs/plans/clinician-practice-onboarding.md
    status: Mapped[str] = mapped_column(
        String, nullable=False, default="active", server_default="active"
    )
    # Set by Float admin. Kept apart from status so letting a practice back in returns it to exactly
    # where it was in setup.
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    state: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    # Roughly how many clinicians, from the access request. Only decides whether the setup
    # checklist suggests inviting a colleague.
    size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )
