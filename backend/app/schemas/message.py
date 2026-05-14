from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid


class MessageCreate(BaseModel):
    recipient_user_id: uuid.UUID
    content: str
    message_type: str = "general"


class MessageResponse(BaseModel):
    id: uuid.UUID
    sender_user_id: uuid.UUID
    recipient_user_id: uuid.UUID
    patient_id: uuid.UUID
    content: str
    message_type: str
    sender_type: Optional[str] = None
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
