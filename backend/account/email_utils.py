import logging
import unicodedata
from typing import Any, Dict, Mapping, Optional, Sequence

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone

from .observability import hash_email, scrub_text

logger = logging.getLogger("account")


_GREETING_WORD_MAX = 40
_GREETING_WORDS_MAX = 3


def safe_greeting_name(name) -> str:
    """Name fragment that is safe to print in an email greeting ("Hello <name>").

    Sign-up only requires Latin *letters* in names, so punctuation, digits and URLs
    are allowed - and these emails go to whatever address was typed, including a
    victim's. Keep only leading words made of letters/marks/apostrophes/hyphens/dots
    (at most three, 40 characters each); anything else falls back to "there".
    """
    if not isinstance(name, str):
        return "there"
    kept = []
    for word in name.split():
        if len(word) > _GREETING_WORD_MAX:
            break
        if not all(
            unicodedata.category(ch)[0] in ("L", "M") or ch in "'\u2019-." for ch in word
        ):
            break
        kept.append(word)
        if len(kept) == _GREETING_WORDS_MAX:
            break
    return " ".join(kept) or "there"


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
) -> bool:
    """Send a transactional email using Django's SMTP framework.

    Returns True when the message was accepted by SMTP, False on send failure.
    Callers that start cooldowns must only do so when this returns True.

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
            extra={"recipient_count": len(list(to)), "template": template_base},
        )
        return True
    except Exception as exc:
        # Do not leak SMTP errors to end-users; log for ops and signal failure
        # to callers so they can avoid starting cooldowns / false "sent" claims.
        # Recipients are logged as hashes only (no raw addresses in log files).
        recipients = ",".join(hash_email(address) for address in to)
        logger.error(
            "Failed to send email to [%s] using template %s: %s: %s",
            recipients,
            template_base,
            type(exc).__name__,
            scrub_text(str(exc))[:300],  # emails/tokens masked
        )
        return False


def send_email_verification_email(
    *, to_email: str, user_name: str, verification_url: str
) -> bool:
    """Send email verification email to new user. Returns True if SMTP accepted."""
    context = {
        "user_name": safe_greeting_name(user_name),
        "user_email": to_email,
        "verification_url": verification_url,
        "current_year": timezone.now().year,
    }

    return send_templated_email(
        to=[to_email],
        subject="Verify Your Email Address",
        template_base="email_verification",
        context=context,
    )


def send_email_verification_confirmation_email(
    *, to_email: str, user_name: str, home_url: str
) -> bool:
    """Send email verification confirmation email. Returns True if SMTP accepted."""
    context = {
        "user_name": safe_greeting_name(user_name),
        "user_email": to_email,
        "home_url": home_url,
        "current_year": timezone.now().year,
    }

    return send_templated_email(
        to=[to_email],
        subject="Email Verified - Welcome to Landars Food!",
        template_base="email_verification_confirmation",
        context=context,
    )


def send_password_reset_email(*, to_email: str, user_name: str, reset_url: str) -> bool:
    """High-level helper dedicated to password reset emails."""
    context = {
        "user_name": safe_greeting_name(user_name),
        "user_email": to_email,
        "reset_url": reset_url,
        "login_url": None,
        "current_year": timezone.now().year,
    }

    return send_templated_email(
        to=[to_email],
        subject="Password Reset Request",
        template_base="password_reset",
        context=context,
    )


def send_password_reset_confirmation_email(
    *, to_email: str, user_name: str, login_url: str
) -> bool:
    """High-level helper dedicated to password reset confirmation emails."""
    context = {
        "user_name": safe_greeting_name(user_name),
        "user_email": to_email,
        "login_url": login_url,
        "current_year": timezone.now().year,
    }

    return send_templated_email(
        to=[to_email],
        subject="Password Reset Confirmation",
        template_base="password_reset_confirmation",
        context=context,
    )
