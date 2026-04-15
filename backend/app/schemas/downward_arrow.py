from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid


class ArrowStep(BaseModel):
    question: str
    response: str


class DownwardArrowCreate(BaseModel):
    facilitated_by: str = "practitioner"
    first_answer: Optional[str] = None


class DownwardArrowUpdate(BaseModel):
    arrow_steps: Optional[list[ArrowStep]] = None
    feared_outcome: Optional[str] = None
    bip_derived: Optional[float] = None
    facilitated_by: Optional[str] = None
    is_approved: Optional[bool] = None


class DownwardArrowResponse(BaseModel):
    id: uuid.UUID
    trigger_situation_id: uuid.UUID
    arrow_steps: list[ArrowStep]
    feared_outcome: Optional[str] = None
    feared_outcome_approved: bool
    bip_derived: Optional[float] = None
    facilitated_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
