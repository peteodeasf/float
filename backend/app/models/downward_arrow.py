import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, text, Boolean, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class DownwardArrow(Base):
    __tablename__ = "downward_arrows"

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
