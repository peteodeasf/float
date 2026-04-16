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


async def send_teen_invitation_email(
    to_email: str,
    login_url: str,
    temporary_password: str,
) -> bool:
    """Send a teen invitation email with a temporary password."""

    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured — skipping teen invite email")
        return False

    resend.api_key = settings.RESEND_API_KEY

    html_body = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#fafafa; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">

  <div style="background:#0d9488; padding:24px 32px; text-align:center;">
    <span style="font-size:22px; font-weight:500; color:#ffffff; letter-spacing:0.03em;">float</span>
  </div>

  <div style="max-width:480px; margin:0 auto; padding:32px 24px;">
    <div style="background:#ffffff; border-radius:10px; padding:32px 28px; border:1px solid #e2e8f0;">

      <p style="font-size:18px; font-weight:600; color:#0f172a; margin:0 0 12px;">
        You're invited to Float 🎉
      </p>

      <p style="font-size:15px; color:#475569; line-height:1.6; margin:0 0 20px;">
        Your clinician has set up your anxiety toolkit. Log in to see your plan, track your experiments, and build your confidence — one small step at a time.
      </p>

      <div style="text-align:center; margin:0 0 24px;">
        <a href="{login_url}"
           style="display:inline-block; padding:14px 40px; background:#0d9488;
                  color:#ffffff; text-decoration:none; border-radius:6px;
                  font-size:16px; font-weight:600;">
          Open Float
        </a>
      </div>

      <div style="background:#f0fdfa; border-radius:8px; padding:16px 20px; margin:0 0 20px;">
        <p style="font-size:13px; font-weight:600; color:#134e4a; margin:0 0 8px;">
          Your login
        </p>
        <p style="font-size:14px; color:#475569; line-height:1.6; margin:0 0 4px;">
          Email: <strong>{to_email}</strong>
        </p>
        <p style="font-size:14px; color:#475569; line-height:1.6; margin:0 0 4px;">
          Temporary password: <code style="background:#fff; padding:2px 6px; border-radius:4px; border:1px solid #e2e8f0;">{temporary_password}</code>
        </p>
        <p style="font-size:13px; color:#64748b; line-height:1.5; margin:8px 0 0;">
          You'll be asked to set your own password the first time you sign in.
        </p>
      </div>

      <p style="font-size:13px; color:#94a3b8; line-height:1.5; margin:0;">
        Log in here: <a href="{login_url}" style="color:#0d9488;">{login_url}</a>
      </p>

    </div>
  </div>

  <div style="text-align:center; padding:16px 24px 32px;">
    <p style="font-size:12px; color:#94a3b8; margin:0;">
      Sent via Float
    </p>
  </div>

</body>
</html>
"""

    text_body = f"""You're invited to Float

Your clinician has set up your anxiety toolkit. Log in to see your plan.

Log in here: {login_url}

Your login:
Email: {to_email}
Temporary password: {temporary_password}

You'll be asked to set your own password the first time you sign in.

---
Sent via Float
"""

    try:
        resend.Emails.send({
            "from": f"{settings.RESEND_FROM_NAME} <{settings.RESEND_FROM_EMAIL}>",
            "to": [to_email],
            "subject": "You're invited to Float",
            "html": html_body,
            "text": text_body,
        })
        logger.info(f"Teen invitation email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send teen invitation email to {to_email}: {e}")
        return False


async def send_password_reset_email(to_email: str, reset_link: str) -> bool:
    """Send a password reset email with a secure one-time link."""

    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured — skipping password reset email")
        return False

    resend.api_key = settings.RESEND_API_KEY

    html_body = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#fafafa; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">

  <div style="background:#0d9488; padding:24px 32px; text-align:center;">
    <span style="font-size:22px; font-weight:500; color:#ffffff; letter-spacing:0.03em;">float</span>
  </div>

  <div style="max-width:480px; margin:0 auto; padding:32px 24px;">
    <div style="background:#ffffff; border-radius:10px; padding:32px 28px; border:1px solid #e2e8f0;">

      <p style="font-size:18px; font-weight:600; color:#0f172a; margin:0 0 16px;">
        Reset your Float password
      </p>

      <p style="font-size:15px; color:#475569; line-height:1.6; margin:0 0 20px;">
        We received a request to reset your password. Click the link below to choose a new one. This link expires in 1 hour.
      </p>

      <div style="text-align:center; margin:0 0 24px;">
        <a href="{reset_link}"
           style="display:inline-block; padding:14px 40px; background:#0d9488;
                  color:#ffffff; text-decoration:none; border-radius:6px;
                  font-size:16px; font-weight:600;">
          Reset password
        </a>
      </div>

      <p style="font-size:13px; color:#94a3b8; line-height:1.5; margin:0;">
        If you didn't request this, you can safely ignore this email.
      </p>

    </div>
  </div>

  <div style="text-align:center; padding:16px 24px 32px;">
    <p style="font-size:12px; color:#94a3b8; margin:0;">
      Sent via Float
    </p>
  </div>

</body>
</html>
"""

    text_body = f"""Reset your Float password

We received a request to reset your password. Click the link below to choose a new one. This link expires in 1 hour.

{reset_link}

If you didn't request this, you can safely ignore this email.

---
Sent via Float
"""

    try:
        resend.Emails.send({
            "from": f"{settings.RESEND_FROM_NAME} <{settings.RESEND_FROM_EMAIL}>",
            "to": [to_email],
            "subject": "Reset your Float password",
            "html": html_body,
            "text": text_body,
        })
        logger.info(f"Password reset email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send password reset email to {to_email}: {e}")
        return False
