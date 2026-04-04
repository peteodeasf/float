import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, text, Numeric, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class ExposureLadder(Base):
    __tablename__ = "exposure_ladders"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    trigger_situation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trigger_situations.id"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String, nullable=False, default="not_started")
    review_status: Mapped[str | None] = mapped_column(String, nullable=True, default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )


class LadderRung(Base):
    __tablename__ = "ladder_rungs"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    ladder_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exposure_ladders.id"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    avoidance_behavior_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("avoidance_behaviors.id"), nullable=True
    )
    distress_thermometer_rating: Mapped[float | None] = mapped_column(
        Numeric(3, 1), nullable=True
    )
    rung_order: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="not_started")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )
