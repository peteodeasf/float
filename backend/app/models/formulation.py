import uuid
from datetime import datetime
from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, ARRAY, text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class ClinicalFormulation(Base):
    __tablename__ = "clinical_formulations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patient_profiles.id"))
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    practitioner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("practitioner_profiles.id"))
    maintaining_mechanisms: Mapped[str | None] = mapped_column(Text, nullable=True)
    accommodation_patterns: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    treatment_targets: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    ai_suggested: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), onupdate=text("now()"))
