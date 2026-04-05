from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid


class ExperimentCreate(BaseModel):
    scheduled_date: Optional[datetime] = None


class ExperimentBeforeState(BaseModel):
    plan_description: str
    prediction: str
    bip_before: float
    distress_thermometer_expected: float
    tempting_behaviors: Optional[str] = None
    confidence_level: str


class ExperimentAfterState(BaseModel):
    feared_outcome_occurred: bool
    what_happened: str
    distress_thermometer_actual: float
    bip_after: float
    what_learned: str


class ExperimentResponse(BaseModel):
    id: uuid.UUID
    ladder_rung_id: uuid.UUID
    patient_id: uuid.UUID
    status: str
    scheduled_date: Optional[datetime] = None
    completed_date: Optional[datetime] = None
    # Before state
    plan_description: Optional[str] = None
    prediction: Optional[str] = None
    bip_before: Optional[float] = None
    distress_thermometer_expected: Optional[float] = None
    tempting_behaviors: Optional[str] = None
    confidence_level: Optional[str] = None
    # After state
    feared_outcome_occurred: Optional[bool] = None
    what_happened: Optional[str] = None
    distress_thermometer_actual: Optional[float] = None
    bip_after: Optional[float] = None
    what_learned: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ExperimentListResponse(BaseModel):
    id: uuid.UUID
    ladder_rung_id: uuid.UUID
    status: str
    scheduled_date: Optional[datetime] = None
    completed_date: Optional[datetime] = None
    bip_before: Optional[float] = None
    bip_after: Optional[float] = None
    distress_thermometer_expected: Optional[float] = None
    distress_thermometer_actual: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True
