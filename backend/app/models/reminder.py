"""Every reminder that went out.

What keeps a reminder from going twice, and a person to one reminder a day.
docs/plans/scheduled-jobs.md
"""
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ReminderSent(Base):
    __tablename__ = "reminders_sent"
    __table_args__ = (
        UniqueConstraint("user_id", "kind", "ref", name="uq_reminder_once"),
        Index("ix_reminders_sent_user_day", "user_id", "local_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    #: child_exposure | parent_checkin
    kind: Mapped[str] = mapped_column(String, nullable=False)
    #: What it was about: the day, for a child's exposures; the week, for a check-in.
    ref: Mapped[str] = mapped_column(String, nullable=False)
    #: The day it went, where the person lives.
    local_date: Mapped[date] = mapped_column(Date, nullable=False)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
