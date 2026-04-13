from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import date, datetime
import uuid


class PatientCreate(BaseModel):
    name: str
    email: EmailStr
    age: Optional[int] = None
    gender: Optional[str] = None
    phone_number: Optional[str] = None


class PatientResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    email: str
    age: Optional[int] = None
    gender: Optional[str] = None
    phone_number: Optional[str] = None
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

    class Config:
        from_attributes = True
