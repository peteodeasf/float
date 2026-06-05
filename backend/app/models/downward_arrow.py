import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, text, Boolean, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class DownwardArrow(Base):
    __tablename__ = "downward_arrows"
    __table_args__ = (
        UniqueConstraint(
            "trigger_situation_id", "facilitated_by",
            name="uq_downward_arrows_situation_facilitated_by"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    # Nullable so situation-agnostic arrows (e.g. the parent DA) can be stored
    # without a linked trigger situation.
    trigger_situation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("trigger_situations.id"), nullable=True
    )
    # Directly links the arrow to a patient. Required for situation-agnostic
    # arrows (where trigger_situation_id is null); for situation-linked arrows
    # it is backfilled from the situation's treatment plan.
    patient_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("patient_profiles.id"), nullable=True
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    arrow_steps: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)
    feared_outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    feared_outcome_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    bip_derived: Mapped[float | None] = mapped_column(nullable=True)
    facilitated_by: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )
