import logging
from contextlib import contextmanager
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.template.loader import render_to_string
from django.utils import timezone

logger = logging.getLogger("account")


@contextmanager
def smtp_connection():
    """Context manager that yields a reusable SMTP connection.

    Ensures a single TCP connection is used to send multiple emails, which
    improves performance and reliability when sending bursts of messages.
    """
    connection = None
    try:
        connection = get_connection()  # uses EMAIL_* settings
        connection.open()
        yield connection
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error(f"Failed to open SMTP connection: {exc}")
        # Re-raise to allow callers to decide on fallback behavior
        raise
    finally:
        try:
            if connection:
                connection.close()
        except Exception:
            # Ensure close never crashes the request path
            logger.debug("SMTP connection close suppressed")


def _render_email_bodies(
    template_base: str, context: Mapping[str, Any]
) -> Dict[str, str]:
    """Render plaintext and HTML bodies for a given template base name.

    Expects templates at:
      templates/emails/{template_base}.txt
      templates/emails/{template_base}.html
    """
    text_template = f"emails/{template_base}.txt"
    html_template = f"emails/{template_base}.html"

    text_body = render_to_string(text_template, context)
    try:
        html_body = render_to_string(html_template, context)
    except Exception:
        # HTML body is optional, fall back to text-only
        html_body = ""

    return {"text": text_body, "html": html_body}


def send_templated_email(
    *,
    to: Sequence[str],
    subject: str,
    template_base: str,
    context: Mapping[str, Any],
    from_email: Optional[str] = None,
    cc: Optional[Sequence[str]] = None,
    bcc: Optional[Sequence[str]] = None,
    reply_to: Optional[Sequence[str]] = None,
    headers: Optional[Mapping[str, str]] = None,
    connection=None,
) -> None:
    """Send a transactional email using Django's SMTP framework.

    - Renders both text and HTML bodies
    - Reuses the supplied connection when provided
    - Applies DEFAULT_FROM_EMAIL when from_email is not set
    """
    effective_from = from_email or settings.DEFAULT_FROM_EMAIL

    bodies = _render_email_bodies(template_base, context)

    # Prefix subject if configured (helps filtering and brand consistency)
    prefix = getattr(settings, "EMAIL_SUBJECT_PREFIX", "")
    final_subject = f"{prefix}{subject}" if prefix else subject

    message = EmailMultiAlternatives(
        subject=final_subject,
        body=bodies["text"],
        from_email=effective_from,
        to=list(to),
        cc=list(cc) if cc else None,
        bcc=list(bcc) if bcc else None,
        reply_to=list(reply_to) if reply_to else None,
        headers=dict(headers) if headers else None,
        connection=connection,
    )

    if bodies["html"]:
        message.attach_alternative(bodies["html"], "text/html")

    try:
        message.send(fail_silently=False)
        logger.info(
            "Transactional email sent",
            extra={"to": list(to), "template": template_base},
        )
    except Exception as exc:
        # Do not leak SMTP errors to end-users; log for ops
        logger.error(
            f"Failed to send email to {to} using template {template_base}: {exc}"
        )
        # In security-sensitive flows we intentionally swallow the error
        # and proceed with a generic success response to avoid info leaks.


def send_email_verification_email(
    *, to_email: str, user_name: str, verification_url: str
) -> None:
    """Send email verification email to new user"""
    context = {
        "user_name": user_name,
        "user_email": to_email,
        "verification_url": verification_url,
        "current_year": timezone.now().year,
    }

    send_templated_email(
        to=[to_email],
        subject="Verify Your Email Address - Landars Food",
        template_base="email_verification",
        context=context,
    )


def send_email_verification_confirmation_email(
    *, to_email: str, user_name: str, dashboard_url: str
) -> None:
    """Send email verification confirmation email"""
    context = {
        "user_name": user_name,
        "user_email": to_email,
        "dashboard_url": dashboard_url,
        "current_year": timezone.now().year,
    }

    send_templated_email(
        to=[to_email],
        subject="Email Verified - Welcome to Landars Food!",
        template_base="email_verification_confirmation",
        context=context,
    )


def send_password_reset_email(*, to_email: str, user_name: str, reset_url: str) -> None:
    """High-level helper dedicated to password reset emails."""
    context = {
        "user_name": user_name,
        "user_email": to_email,
        "reset_url": reset_url,
        "login_url": None,
        "current_year": timezone.now().year,
    }

    with smtp_connection() as conn:
        send_templated_email(
            to=[to_email],
            subject="Password Reset Request - Landars Food",
            template_base="password_reset",
            context=context,
            connection=conn,
        )


def send_password_reset_confirmation_email(
    *, to_email: str, user_name: str, login_url: str
) -> None:
    """High-level helper dedicated to password reset confirmation emails."""
    context = {
        "user_name": user_name,
        "user_email": to_email,
        "login_url": login_url,
        "current_year": timezone.now().year,
    }

    with smtp_connection() as conn:
        send_templated_email(
            to=[to_email],
            subject="Password Reset Confirmation - Landars Food",
            template_base="password_reset_confirmation",
            context=context,
            connection=conn,
        )
