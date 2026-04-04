from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid


class TriggerSituationCreate(BaseModel):
    name: str
    description: Optional[str] = None
    distress_thermometer_rating: Optional[float] = None


class TriggerSituationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    distress_thermometer_rating: Optional[float] = None


class TriggerSituationResponse(BaseModel):
    id: uuid.UUID
    treatment_plan_id: uuid.UUID
    name: str
    description: Optional[str] = None
    distress_thermometer_rating: Optional[float] = None
    display_order: int
    created_at: datetime

    class Config:
        from_attributes = True


class ReorderRequest(BaseModel):
    ordered_ids: list[uuid.UUID]
