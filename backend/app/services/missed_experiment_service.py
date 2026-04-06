from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.models.experiment import Experiment
from app.models.notification import Notification
from app.models.patient import PatientProfile


async def detect_missed_experiments(db: AsyncSession) -> int:
    """
    Find experiments where scheduled_date has passed and status
    is still planned or in_progress. Create a notification for
    the practitioner if one hasn't been sent already.
    Returns count of new missed experiment notifications created.
    """
    now = datetime.now(timezone.utc)

    # Get overdue experiments
    result = await db.execute(
        select(Experiment)
        .where(
            and_(
                Experiment.scheduled_date < now,
                Experiment.status.in_(["planned", "in_progress"])
            )
        )
    )
    overdue = result.scalars().all()

    new_notifications = 0

    for experiment in overdue:
        # Check if we already sent a missed notification for this experiment
        existing = await db.execute(
            select(Notification)
            .where(
                Notification.patient_id == experiment.patient_id,
                Notification.type == "experiment_missed",
                Notification.content.contains(str(experiment.id))
            )
        )
        if existing.scalar_one_or_none():
            continue

        # Get patient to find practitioner
        patient_result = await db.execute(
            select(PatientProfile)
            .where(PatientProfile.id == experiment.patient_id)
        )
        patient = patient_result.scalar_one_or_none()
        if not patient or not patient.primary_practitioner_id:
            continue

        # Create missed experiment notification for practitioner
        notification = Notification(
            patient_id=experiment.patient_id,
            organization_id=experiment.organization_id,
            type="experiment_missed",
            content=f"Patient missed a planned experiment (id: {experiment.id}). "
                   f"Scheduled for {experiment.scheduled_date.strftime('%Y-%m-%d %H:%M')}. "
                   f"Consider reaching out to check in.",
            status="pending"
        )
        db.add(notification)
        new_notifications += 1

    if new_notifications > 0:
        await db.commit()

    return new_notifications
