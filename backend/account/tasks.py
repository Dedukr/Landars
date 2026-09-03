from __future__ import annotations

import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger("account")


@shared_task(
    bind=True,
    ignore_result=True,
    max_retries=3,
    default_retry_delay=30,
)
def send_verification_email_task(self, token_id: int) -> None:
    """Send email verification link; set email_sent_at on success."""
    from account.email_utils import send_email_verification_email
    from account.frontend_urls import get_public_frontend_base_url
    from account.models import EmailVerificationToken

    try:
        verification_token = EmailVerificationToken.objects.select_related("user").get(
            pk=token_id
        )
    except EmailVerificationToken.DoesNotExist:
        logger.error("Verification token %s not found for email task", token_id)
        return

    user = verification_token.user
    if user.is_email_verified:
        return

    frontend_url = get_public_frontend_base_url()
    verification_url = f"{frontend_url}/verify-email?token={verification_token.token}"
    email_sent = send_email_verification_email(
        to_email=user.email,
        user_name=user.get_display_name(),
        verification_url=verification_url,
    )
    if email_sent:
        verification_token.email_sent_at = timezone.now()
        verification_token.save(update_fields=["email_sent_at"])
        logger.info("Verification email sent to %s (token %s)", user.email, token_id)
    else:
        logger.error("Verification email failed for %s (token %s)", user.email, token_id)
        raise self.retry(exc=RuntimeError("SMTP rejected verification email"))


@shared_task(
    bind=True,
    ignore_result=True,
    max_retries=3,
    default_retry_delay=30,
)
def send_verification_confirmation_email_task(self, user_id: int) -> None:
    """Send post-verification welcome email."""
    from account.email_utils import send_email_verification_confirmation_email
    from account.frontend_urls import get_public_frontend_base_url
    from account.models import CustomUser

    try:
        user = CustomUser.objects.get(pk=user_id)
    except CustomUser.DoesNotExist:
        logger.error("User %s not found for confirmation email task", user_id)
        return

    home_url = get_public_frontend_base_url()
    email_sent = send_email_verification_confirmation_email(
        to_email=user.email,
        user_name=user.get_display_name(),
        home_url=home_url,
    )
    if not email_sent:
        logger.error("Confirmation email failed for %s", user.email)
        raise self.retry(exc=RuntimeError("SMTP rejected confirmation email"))
