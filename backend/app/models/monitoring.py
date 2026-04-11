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
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )
