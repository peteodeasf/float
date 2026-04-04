import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, text, Numeric, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class Experiment(Base):
    __tablename__ = "experiments"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    ladder_rung_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("ladder_rungs.id"), nullable=False
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("patient_profiles.id"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    scheduled_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(String, nullable=False, default="planned")
    # Before state
    plan_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    prediction: Mapped[str | None] = mapped_column(Text, nullable=True)
    bip_before: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    distress_thermometer_expected: Mapped[float | None] = mapped_column(
        Numeric(3, 1), nullable=True
    )
    tempting_behaviors: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence_level: Mapped[str | None] = mapped_column(String, nullable=True)
    # After state
    feared_outcome_occurred: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    what_happened: Mapped[str | None] = mapped_column(Text, nullable=True)
    distress_thermometer_actual: Mapped[float | None] = mapped_column(
        Numeric(3, 1), nullable=True
    )
    bip_after: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    what_learned: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )


class AccommodationBehavior(Base):
    __tablename__ = "accommodation_behaviors"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    treatment_plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("treatment_plans.id"), nullable=False
    )
    parent_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    distress_thermometer_when_refraining: Mapped[float | None] = mapped_column(
        Numeric(3, 1), nullable=True
    )
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )
