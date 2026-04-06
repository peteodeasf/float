import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.models.message import Message
from app.schemas.message import MessageCreate


async def get_messages_for_patient(
    db: AsyncSession,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID
) -> list[Message]:
    result = await db.execute(
        select(Message)
        .where(
            Message.patient_id == patient_id,
            Message.organization_id == organization_id
        )
        .order_by(Message.created_at.asc())
    )
    return result.scalars().all()


async def send_message(
    db: AsyncSession,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID,
    sender_user_id: uuid.UUID,
    data: MessageCreate
) -> Message:
    message = Message(
        organization_id=organization_id,
        sender_user_id=sender_user_id,
        recipient_user_id=data.recipient_user_id,
        patient_id=patient_id,
        content=data.content,
        message_type=data.message_type
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


async def mark_read(
    db: AsyncSession,
    message_id: uuid.UUID,
    organization_id: uuid.UUID
) -> Message | None:
    result = await db.execute(
        select(Message)
        .where(
            Message.id == message_id,
            Message.organization_id == organization_id
        )
    )
    message = result.scalar_one_or_none()
    if message and not message.read_at:
        message.read_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(message)
    return message
