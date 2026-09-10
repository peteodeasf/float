from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime
import uuid


class AccommodationCreate(BaseModel):
    name: str
    description: Optional[str] = None
    trigger_situation_id: Optional[uuid.UUID] = None
    # The child's distress-if-stopped, as a range. A single value is min == max.
    distress_min: Optional[float] = None
    distress_max: Optional[float] = None


class AccommodationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trigger_situation_id: Optional[uuid.UUID] = None
    distress_min: Optional[float] = None
    distress_max: Optional[float] = None
    # Where the parent has got to with stopping it. docs/plans/accommodation-states.md
    status: Optional[Literal['not_started', 'started', 'stopped']] = None
    is_weekly_focus: Optional[bool] = None


class AccommodationResponse(BaseModel):
    id: uuid.UUID
    treatment_plan_id: uuid.UUID
    trigger_situation_id: Optional[uuid.UUID] = None
    parent_user_id: Optional[uuid.UUID] = None
    name: str
    description: Optional[str] = None
    distress_min: Optional[float] = None
    distress_max: Optional[float] = None
    display_order: Optional[int] = None
    parent_estimate_min: Optional[float] = None
    parent_estimate_max: Optional[float] = None
    child_rated_at: Optional[datetime] = None
    status: str
    is_weekly_focus: bool = False
    accommodator: str
    created_at: datetime

    class Config:
        from_attributes = True


class ParentAccommodationResponse(BaseModel):
    """An accommodation as the parent app gets it. Not the child's rating of it
    (distress_min/max, child_rated_at): Peter, 2026-09-10, the clinician chooses whether a parent
    sees that. A field left out here cannot leak. docs/plans/accommodation-conversation.md"""
    id: uuid.UUID
    trigger_situation_id: Optional[uuid.UUID] = None
    name: str
    description: Optional[str] = None
    display_order: Optional[int] = None
    status: str
    is_weekly_focus: bool = False

    class Config:
        from_attributes = True


class SuggestionUpdate(BaseModel):
    """The parent's answers about one accommodation: do they still do it, and how hard would it
    be for the child if they stopped. docs/plans/accommodation-conversation.md"""
    still_does: Optional[bool] = None
    estimate_min: Optional[float] = Field(default=None, ge=1, le=10)
    estimate_max: Optional[float] = Field(default=None, ge=1, le=10)


class SuggestionCreate(BaseModel):
    """Something else the parent does when a situation comes up."""
    trigger_situation_id: uuid.UUID
    name: str = Field(min_length=1, max_length=300)
    estimate_min: Optional[float] = Field(default=None, ge=1, le=10)
    estimate_max: Optional[float] = Field(default=None, ge=1, le=10)


class ReorderRequest(BaseModel):
    ordered_ids: list[uuid.UUID]
