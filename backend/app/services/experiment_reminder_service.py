import logging
from datetime import datetime, timezone, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

from app.core.config import settings
from app.models.experiment import Experiment
from app.models.patient import PatientProfile
from app.services.sms_service import send_experiment_reminder_sms

logger = logging.getLogger(__name__)


async def send_experiment_reminders(db: AsyncSession) -> int:
    """
    Find experiments scheduled for today that are committed but not yet
    completed. Send SMS reminder to the patient if they have a phone number.
    Returns count of reminders sent.
    """
    today = date.today()

    result = await db.execute(
        select(Experiment).where(
            and_(
                func.date(Experiment.scheduled_date) == today,
                Experiment.status == "committed",
                Experiment.reminder_sent_at.is_(None)
            )
        )
    )
    experiments = result.scalars().all()

    sent_count = 0
    for exp in experiments:
        # Get patient profile
        patient_result = await db.execute(
            select(PatientProfile).where(PatientProfile.id == exp.patient_id)
        )
        patient = patient_result.scalar_one_or_none()
        if not patient or not patient.phone_number:
            continue

        record_link = f"{settings.BASE_URL}/teen/record/{exp.id}"

        success = await send_experiment_reminder_sms(
            to_number=patient.phone_number,
            child_name=patient.name.split()[0],
            record_link=record_link
        )

        if success:
            exp.reminder_sent_at = datetime.now(timezone.utc)
            sent_count += 1

    await db.commit()
    logger.info(f"Sent {sent_count} experiment reminders")
    return sent_count
