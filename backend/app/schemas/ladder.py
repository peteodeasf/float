from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid


class LadderRungCreate(BaseModel):
    avoidance_behavior_id: Optional[uuid.UUID] = None
    distress_thermometer_rating: Optional[float] = None
    rung_order: int


class LadderRungUpdate(BaseModel):
    avoidance_behavior_id: Optional[uuid.UUID] = None
    distress_thermometer_rating: Optional[float] = None


class LadderRungResponse(BaseModel):
    id: uuid.UUID
    ladder_id: uuid.UUID
    avoidance_behavior_id: Optional[uuid.UUID] = None
    distress_thermometer_rating: Optional[float] = None
    rung_order: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class LadderResponse(BaseModel):
    id: uuid.UUID
    trigger_situation_id: uuid.UUID
    status: str
    review_status: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    rungs: list[LadderRungResponse] = []

    class Config:
        from_attributes = True


class RungReorderRequest(BaseModel):
    ordered_ids: list[uuid.UUID]
