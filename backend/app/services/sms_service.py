import logging
from twilio.rest import Client
from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_sms(to_number: str, message: str) -> bool:
    """Send an SMS via Twilio. Returns True if successful."""
    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        logger.warning("Twilio credentials not configured — skipping SMS send")
        return False

    try:
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        client.messages.create(
            body=message,
            from_=settings.TWILIO_PHONE_NUMBER,
            to=to_number
        )
        logger.info(f"SMS sent to {to_number}")
        return True
    except Exception as e:
        logger.error(f"Failed to send SMS to {to_number}: {e}")
        return False


async def send_monitoring_form_sms(
    to_number: str,
    clinician_name: str,
    monitoring_link: str,
    child_name: str
) -> bool:
    """Send monitoring form invitation via SMS."""
    message = (
        f"Hi — {clinician_name} has asked you to complete a short "
        f"monitoring form about {child_name} before your first appointment. "
        f"It takes about 5 min/day for a week. Open it here: {monitoring_link}"
    )
    return await send_sms(to_number, message)


async def send_experiment_reminder_sms(
    to_number: str,
    child_name: str,
    record_link: str
) -> bool:
    """Send end-of-day experiment reminder to teen."""
    message = (
        f"Hi {child_name} — you had an experiment scheduled today. "
        f"Take 2 minutes to record how it went: {record_link}"
    )
    return await send_sms(to_number, message)
