from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid


class AccommodationCreate(BaseModel):
    name: str
    description: Optional[str] = None
    trigger_situation_id: Optional[uuid.UUID] = None
    # The child's distress-if-stopped, as a range. A single value is min == max.
    distress_min: Optional[float] = None
    distress_max: Optional[float] = None


class AccommodationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trigger_situation_id: Optional[uuid.UUID] = None
    distress_min: Optional[float] = None
    distress_max: Optional[float] = None
    status: Optional[str] = None


class AccommodationResponse(BaseModel):
    id: uuid.UUID
    treatment_plan_id: uuid.UUID
    trigger_situation_id: Optional[uuid.UUID] = None
    parent_user_id: Optional[uuid.UUID] = None
    name: str
    description: Optional[str] = None
    distress_min: Optional[float] = None
    distress_max: Optional[float] = None
    display_order: Optional[int] = None
    status: str
    accommodator: str
    created_at: datetime

    class Config:
        from_attributes = True


class ReorderRequest(BaseModel):
    ordered_ids: list[uuid.UUID]
