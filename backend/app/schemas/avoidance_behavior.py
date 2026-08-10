from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid


class AvoidanceBehaviorCreate(BaseModel):
    name: str
    description: Optional[str] = None
    behavior_type: str = "avoidance"
    distress_thermometer_when_refraining: Optional[float] = None
    behavior_library_id: Optional[uuid.UUID] = None
    parent_behavior_id: Optional[uuid.UUID] = None


class AvoidanceBehaviorUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    behavior_type: Optional[str] = None
    distress_thermometer_when_refraining: Optional[float] = None


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
