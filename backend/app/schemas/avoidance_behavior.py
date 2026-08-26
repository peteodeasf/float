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
    # Optional at the patient-level endpoint; the per-trigger endpoint sets it from the path.
    trigger_situation_id: Optional[uuid.UUID] = None
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
    # Regrouping a rung. `None` is a real value here — it ungroups — so callers must send the key
    # explicitly (the service reads `model_dump(exclude_unset=True)`).
    trigger_situation_id: Optional[uuid.UUID] = None


class AvoidanceBehaviorResponse(BaseModel):
    id: uuid.UUID
    trigger_situation_id: Optional[uuid.UUID] = None
    treatment_plan_id: Optional[uuid.UUID] = None
    name: str
    description: Optional[str] = None
    behavior_type: str
    distress_thermometer_when_refraining: Optional[float] = None
    behavior_library_id: Optional[uuid.UUID] = None
    parent_behavior_id: Optional[uuid.UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True
