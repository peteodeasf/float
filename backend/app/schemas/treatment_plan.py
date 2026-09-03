from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid


class TreatmentPlanCreate(BaseModel):
    clinical_track: str = "exposure"
    parent_visibility_level: str = "summary"
    nickname: Optional[str] = None


class TreatmentPlanResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    practitioner_id: uuid.UUID
    clinical_track: str
    parent_visibility_level: str
    status: str
    nickname: Optional[str] = None
    activated_at: Optional[datetime] = None
    #: The whole ladder is on for the child, or it is not.
    ladder_active: bool = False
    #: The one rung suggested next, if any.
    recommended_rung_id: Optional[uuid.UUID] = None
    last_extracted_at: Optional[datetime] = None
    has_new_monitoring_entries: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TreatmentPlanUpdate(BaseModel):
    clinical_track: Optional[str] = None
    parent_visibility_level: Optional[str] = None
    status: Optional[str] = None
    nickname: Optional[str] = None
    #: The whole ladder is on for the child, or it is not (Peter, 2026-09-01).
    ladder_active: Optional[bool] = None
    #: The one rung suggested next. `None` in the payload leaves it alone; to clear it, send
    #: `clear_recommended_rung`.
    recommended_rung_id: Optional[uuid.UUID] = None
    clear_recommended_rung: Optional[bool] = None
