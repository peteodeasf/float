import logging
import resend
from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_monitoring_form_email(
    to_email: str,
    clinician_name: str,
    monitoring_link: str,
    child_name: str,
    parent_name: str = ""
) -> bool:
    """Send the monitoring form invitation email to a parent."""

    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured — skipping email send")
        return False

    resend.api_key = settings.RESEND_API_KEY

    greeting = f"Hi {parent_name}," if parent_name else "Hi there,"

    html_body = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#f8fafc; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width:480px; margin:0 auto; padding:32px 24px;">

    <!-- Logo -->
    <div style="margin-bottom:32px;">
      <span style="font-size:20px; font-weight:600; color:#1e293b;">~ Float</span>
    </div>

    <!-- Greeting -->
    <p style="font-size:16px; color:#1e293b; line-height:1.6; margin-bottom:16px;">
      {greeting}
    </p>

    <!-- Main message -->
    <p style="font-size:16px; color:#475569; line-height:1.6; margin-bottom:24px;">
      {clinician_name} has asked you to complete a short monitoring form about
      {child_name} before your first appointment. It takes about 5 minutes per
      day for about a week.
    </p>

    <!-- CTA button -->
    <div style="text-align:center; margin-bottom:32px;">
      <a href="{monitoring_link}"
         style="display:inline-block; padding:16px 40px; background:#2563eb;
                color:#ffffff; text-decoration:none; border-radius:12px;
                font-size:17px; font-weight:600;">
        Open monitoring form
      </a>
    </div>

    <!-- What to observe -->
    <div style="background:#ffffff; border-radius:12px; padding:20px; margin-bottom:24px; border:1px solid #e2e8f0;">
      <p style="font-size:14px; font-weight:600; color:#334155; margin-bottom:12px;">
        What should I observe?
      </p>
      <p style="font-size:14px; color:#64748b; line-height:1.6; margin-bottom:0;">
        Pay attention to moments during the morning routine, school, meals,
        social situations, homework, and bedtime. Focus on times when
        {child_name} seems anxious, worried, or avoids something. Jot down a
        quick note right after it happens &mdash; you can fill in details later.
      </p>
    </div>

    <!-- Privacy note -->
    <p style="font-size:13px; color:#94a3b8; line-height:1.5; margin-bottom:32px;">
      This link is personal to you &mdash; please don't share it with others.
    </p>

    <!-- Footer -->
    <div style="border-top:1px solid #e2e8f0; padding-top:16px;">
      <p style="font-size:12px; color:#94a3b8; margin:0;">
        Sent via Float &middot; floatapp.com
      </p>
    </div>

  </div>
</body>
</html>
"""

    text_body = f"""{greeting}

{clinician_name} has asked you to complete a short monitoring form about {child_name} before your first appointment. It takes about 5 minutes per day for about a week.

Open your monitoring form: {monitoring_link}

What should I observe?
Pay attention to moments during the morning routine, school, meals, social situations, homework, and bedtime. Focus on times when {child_name} seems anxious, worried, or avoids something. Jot down a quick note right after it happens -- you can fill in details later.

This link is personal to you -- please don't share it with others.

---
Sent via Float - floatapp.com
"""

    try:
        resend.Emails.send({
            "from": f"{settings.RESEND_FROM_NAME} <{settings.RESEND_FROM_EMAIL}>",
            "to": [to_email],
            "subject": f"A quick request before your appointment with {clinician_name}",
            "html": html_body,
            "text": text_body,
        })
        logger.info(f"Monitoring form email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send monitoring form email to {to_email}: {e}")
        return False
