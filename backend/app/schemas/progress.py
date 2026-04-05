from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid


class ExperimentDataPoint(BaseModel):
    experiment_id: uuid.UUID
    completed_date: Optional[datetime]
    bip_before: Optional[float]
    bip_after: Optional[float]
    distress_thermometer_expected: Optional[float]
    distress_thermometer_actual: Optional[float]
    feared_outcome_occurred: Optional[bool]
    rung_order: Optional[int] = None


class RungProgress(BaseModel):
    rung_id: uuid.UUID
    rung_order: int
    distress_thermometer_rating: Optional[float]
    experiments_completed: int
    latest_bip_before: Optional[float]
    latest_bip_after: Optional[float]
    latest_distress_thermometer_actual: Optional[float]
    data_points: list[ExperimentDataPoint]


class PatientProgressSummary(BaseModel):
    patient_id: uuid.UUID
    total_experiments_completed: int
    total_experiments_planned: int
    average_bip_reduction: Optional[float]
    average_distress_thermometer_reduction: Optional[float]
    experiments_where_feared_outcome_occurred: int
    last_experiment_date: Optional[datetime]


class PatientProgressFull(BaseModel):
    summary: PatientProgressSummary
    rung_progress: list[RungProgress]
    recent_experiments: list[ExperimentDataPoint]


class PreSessionBrief(BaseModel):
    patient_id: uuid.UUID
    patient_name: str
    experiments_since_last_session: int
    bip_trend: str
    distress_thermometer_trend: str
    last_experiment_date: Optional[datetime]
    current_ladder_status: str
    open_flag_count: int
    recent_learnings: list[str]
    recommended_focus: str
