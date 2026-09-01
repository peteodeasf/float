from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import date, datetime
import uuid


class PatientCreate(BaseModel):
    name: str
    email: EmailStr
    age: Optional[int] = None
    gender: Optional[str] = None
    phone_number: Optional[str] = None
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None


class PatientUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    anxiety_presentations: Optional[List[str]] = None
    phone_number: Optional[str] = None
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None


class PatientResponse(BaseModel):
    id: uuid.UUID
    closed_at: Optional[datetime] = None
    user_id: uuid.UUID
    name: str
    email: str
    age: Optional[int] = None
    gender: Optional[str] = None
    anxiety_presentations: Optional[List[str]] = None
    phone_number: Optional[str] = None
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None
    teen_email: Optional[str] = None
    teen_invited_at: Optional[datetime] = None
    child_connect_consent_at: Optional[datetime] = None
    consent_source: Optional[str] = None
    primary_practitioner_id: Optional[uuid.UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PatientListResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    phone_number: Optional[str] = None
    created_at: datetime
    last_activity_at: Optional[datetime] = None
    # Treatment journey progress
    has_monitoring_form: bool = False
    situation_count: int = 0
    has_consultation_1_note: bool = False
    has_parent_da: bool = False
    has_consultation_2_note: bool = False
    has_patient_da: bool = False
    has_active_situation_with_behaviors: bool = False
    plan_status: Optional[str] = None
    teen_invited: bool = False
    completed_experiment_count: int = 0
    has_weekly_note: bool = False
    # Needs attention
    overdue_experiment_count: int = 0
    active_plan_with_no_recent_activity: bool = False
    monitoring_entries_count: int = 0
    monitoring_form_sent: bool = False
    # Where the patient is up to, worked out on the server so every screen agrees.
    phase: str = "new"
    phase_label: str = "New"
    closed_at: Optional[datetime] = None
    # Consultation checklist state (for surfacing the next action on the list)
    checklist_checked_items: dict = {}

    class Config:
        from_attributes = True
