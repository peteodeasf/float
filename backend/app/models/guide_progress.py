import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class GuideProgress(Base):
    """The clinician guide's ticks for one patient. docs/plans/clinician-guide.md

    `ticks` maps a key to true or false: a goal the clinician ticked (`guide:<step>.<goal>`) or a
    stage they moved on from (`guide:moved-on.<step>`). The keys are written by
    `apps/web/src/lib/clinicianGuide.ts`; renaming one there loses its saved ticks.

    Was `consultation_checklists`, the process checklist's record, until the checklist was removed
    on 2026-11-19 (Peter: "replaced by the new checkable guide").
    """
    __tablename__ = "guide_progress"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patient_profiles.id"), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    ticks: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
