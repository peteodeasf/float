from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid

# Distress-thermometer / fear scores are a fixed 1–10 scale. Guard inputs so an
# out-of-range value (e.g. a stray "16") can never be stored, regardless of client.
DT_MIN = 1
DT_MAX = 10


class TriggerSituationCreate(BaseModel):
    name: str
    description: Optional[str] = None
    distress_thermometer_rating: Optional[float] = Field(default=None, ge=DT_MIN, le=DT_MAX)
    distress_thermometer_max: Optional[float] = Field(default=None, ge=DT_MIN, le=DT_MAX)
    situation_library_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None
    is_placeholder: Optional[bool] = None


class TriggerSituationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    distress_thermometer_rating: Optional[float] = Field(default=None, ge=DT_MIN, le=DT_MAX)
    distress_thermometer_max: Optional[float] = Field(default=None, ge=DT_MIN, le=DT_MAX)
    is_active: Optional[bool] = None


class TriggerSituationResponse(BaseModel):
    id: uuid.UUID
    treatment_plan_id: uuid.UUID
    name: str
    description: Optional[str] = None
    distress_thermometer_rating: Optional[float] = None
    distress_thermometer_max: Optional[float] = None
    situation_library_id: Optional[uuid.UUID] = None
    display_order: int
    is_active: bool = False
    is_placeholder: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class ReorderRequest(BaseModel):
    ordered_ids: list[uuid.UUID]
