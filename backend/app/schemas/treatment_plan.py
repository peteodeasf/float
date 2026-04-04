from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid


class TreatmentPlanCreate(BaseModel):
    clinical_track: str = "exposure"
    parent_visibility_level: str = "summary"


class TreatmentPlanResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    practitioner_id: uuid.UUID
    clinical_track: str
    parent_visibility_level: str
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TreatmentPlanUpdate(BaseModel):
    clinical_track: Optional[str] = None
    parent_visibility_level: Optional[str] = None
    status: Optional[str] = None
