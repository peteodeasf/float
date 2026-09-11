"""What a parent says before and after an accommodation experiment.
docs/plans/parent-accommodation-experiments.md"""
import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class ParentExperimentCreate(BaseModel):
    accommodation_id: uuid.UUID
    scheduled_date: datetime
    scheduled_time_bucket: Literal["morning", "afternoon", "evening"]
    instead: Optional[str] = Field(default=None, max_length=1000)
    prediction: str = Field(min_length=1, max_length=1000)
    belief_before: float = Field(ge=0, le=100)
    expected_fear: float = Field(ge=1, le=10)
    readiness: Optional[Literal["low", "medium", "high"]] = None


class ParentExperimentAfter(BaseModel):
    did_it: Literal["yes", "partly", "not_this_time"]
    what_happened: Optional[str] = Field(default=None, max_length=2000)
    actual_fear: Optional[float] = Field(default=None, ge=1, le=10)
    prediction_happened: Optional[Literal["yes", "partly", "no"]] = None
    belief_after: Optional[float] = Field(default=None, ge=0, le=100)
    what_learned: Optional[str] = Field(default=None, max_length=2000)
    too_hard_reason: Optional[str] = Field(default=None, max_length=2000)
