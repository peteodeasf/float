from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime
import uuid


class ExperimentCreate(BaseModel):
    scheduled_date: Optional[datetime] = None


class ExperimentPlanCreate(BaseModel):
    confidence_level: str
    plan_description: str
    scheduled_date: Optional[datetime] = None


class ExperimentBeforeState(BaseModel):
    plan_description: str
    prediction: str
    bip_before: float
    distress_thermometer_expected: float
    tempting_behaviors: Optional[str] = None
    confidence_level: str
    times_per_day: Optional[int] = None
    scheduled_time_bucket: Optional[str] = None
    # Set when the child picks the day themselves — an exposure set up in session with the day left
    # for them. Left out, the day already on the exposure stands.
    scheduled_date: Optional[datetime] = None


class ExperimentSessionSetup(BaseModel):
    """An exposure set up with the child in session: the child answers, the clinician types.

    Peter, 2026-09-10 — the answers are still the child's. The day is optional: left empty, the
    child picks it at home and the step waits on their ladder until they do.
    """
    prediction: str = Field(min_length=1)
    bip_before: float = Field(ge=0, le=100)
    distress_thermometer_expected: float = Field(ge=1, le=10)
    confidence_level: Literal['low', 'medium', 'high']
    scheduled_date: Optional[datetime] = None
    scheduled_time_bucket: Optional[Literal['morning', 'afternoon', 'evening']] = None


class ExperimentAfterState(BaseModel):
    feared_outcome_occurred: bool
    what_happened: str
    distress_thermometer_actual: float
    bip_after: float
    what_learned: str


class ExperimentResponse(BaseModel):
    id: uuid.UUID
    ladder_rung_id: Optional[uuid.UUID] = None
    avoidance_behavior_id: Optional[uuid.UUID] = None
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
    times_per_day: Optional[int] = None
    scheduled_time_bucket: Optional[str] = None
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
    ladder_rung_id: Optional[uuid.UUID] = None
    avoidance_behavior_id: Optional[uuid.UUID] = None
    status: str
    scheduled_date: Optional[datetime] = None
    scheduled_time_bucket: Optional[str] = None
    completed_date: Optional[datetime] = None
    plan_description: Optional[str] = None
    confidence_level: Optional[str] = None
    bip_before: Optional[float] = None
    bip_after: Optional[float] = None
    distress_thermometer_expected: Optional[float] = None
    distress_thermometer_actual: Optional[float] = None
    feared_outcome_occurred: Optional[bool] = None
    what_learned: Optional[str] = None
    behavior_name: Optional[str] = None
    situation_name: Optional[str] = None
    trigger_situation_id: Optional[uuid.UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True
