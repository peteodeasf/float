from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import date, datetime
import uuid


class PatientCreate(BaseModel):
    name: str
    email: EmailStr
    date_of_birth: Optional[date] = None


class PatientResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID 
    name: str
    email: str
    date_of_birth: Optional[date] = None
    primary_practitioner_id: Optional[uuid.UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PatientListResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True
