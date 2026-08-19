from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid

# Fear-when-refraining is on the fixed 1–10 distress-thermometer scale. Guard inputs
# so an out-of-range value (e.g. a stray "16") can never be stored, regardless of client.
DT_MIN = 1
DT_MAX = 10


class AvoidanceBehaviorCreate(BaseModel):
    name: str
    description: Optional[str] = None
    behavior_type: str = "avoidance"
    distress_thermometer_when_refraining: Optional[float] = Field(default=None, ge=DT_MIN, le=DT_MAX)
    behavior_library_id: Optional[uuid.UUID] = None
    parent_behavior_id: Optional[uuid.UUID] = None


class AvoidanceBehaviorUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    behavior_type: Optional[str] = None
    distress_thermometer_when_refraining: Optional[float] = Field(default=None, ge=DT_MIN, le=DT_MAX)


class AvoidanceBehaviorResponse(BaseModel):
    id: uuid.UUID
    trigger_situation_id: uuid.UUID
    name: str
    description: Optional[str] = None
    behavior_type: str
    distress_thermometer_when_refraining: Optional[float] = None
    behavior_library_id: Optional[uuid.UUID] = None
    parent_behavior_id: Optional[uuid.UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True
