import logging
import resend
from app.core.config import settings

logger = logging.getLogger(__name__)

# NOTE: To send monitoring form emails to real parent email addresses,
# the practitioner's organization needs a verified sending domain in Resend
# (https://resend.com/domains). Once verified, set RESEND_FROM_EMAIL to an
# email address on that domain in your Railway environment variables.
# Without a verified domain, Resend only delivers to the account owner's email.


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
<body style="margin:0; padding:0; background:#fafafa; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">

  <!-- Header -->
  <div style="background:#0d9488; padding:24px 32px; text-align:center;">
    <span style="font-size:22px; font-weight:500; color:#ffffff; letter-spacing:0.03em;">float</span>
  </div>

  <!-- Body card -->
  <div style="max-width:480px; margin:0 auto; padding:32px 24px;">
    <div style="background:#ffffff; border-radius:10px; padding:32px 28px; border:1px solid #e2e8f0;">

      <!-- Greeting -->
      <p style="font-size:16px; color:#1e293b; line-height:1.6; margin:0 0 16px;">
        {greeting}
      </p>

      <!-- Main message -->
      <p style="font-size:15px; color:#475569; line-height:1.6; margin:0 0 24px;">
        {clinician_name} has asked you to keep a short monitoring diary
        about {child_name} before your first appointment. It takes about
        5 minutes per day for about a week.
      </p>

      <!-- CTA button -->
      <div style="text-align:center; margin:0 0 24px;">
        <a href="{monitoring_link}"
           style="display:inline-block; padding:14px 40px; background:#0d9488;
                  color:#ffffff; text-decoration:none; border-radius:6px;
                  font-size:16px; font-weight:600;">
          Open monitoring form
        </a>
      </div>

      <!-- What to observe -->
      <div style="background:#f0fdfa; border-radius:8px; padding:16px 20px; margin:0 0 20px;">
        <p style="font-size:14px; font-weight:600; color:#134e4a; margin:0 0 8px;">
          What should I observe?
        </p>
        <p style="font-size:14px; color:#64748b; line-height:1.6; margin:0;">
          Pay attention to moments during the morning routine, school, meals,
          social situations, homework, and bedtime. Focus on times when
          {child_name} seems anxious, worried, or avoids something. Jot down a
          quick note right after it happens &mdash; you can fill in details later.
        </p>
      </div>

      <!-- Privacy note -->
      <p style="font-size:13px; color:#94a3b8; line-height:1.5; margin:0;">
        This link is personal to you &mdash; please don't share it with others.
      </p>

    </div>
  </div>

  <!-- Footer -->
  <div style="text-align:center; padding:16px 24px 32px;">
    <p style="font-size:12px; color:#94a3b8; margin:0;">
      Sent via Float
    </p>
  </div>

</body>
</html>
"""

    text_body = f"""{greeting}

{clinician_name} has asked you to keep a short monitoring diary about {child_name} before your first appointment. It takes about 5 minutes per day for about a week.

Open your monitoring form: {monitoring_link}

What should I observe?
Pay attention to moments during the morning routine, school, meals, social situations, homework, and bedtime. Focus on times when {child_name} seems anxious, worried, or avoids something. Jot down a quick note right after it happens -- you can fill in details later.

This link is personal to you -- please don't share it with others.

---
Sent via Float
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
