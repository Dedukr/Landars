from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from account.observability import log_auth_event

logger = logging.getLogger("account")

# Transactional mail is the only way a customer can activate an account or recover a
# password, so it is retried with exponential backoff (30 s, 60 s, 2 min, 4 min, 8 min)
# for ~15 minutes before giving up (was: 3 x 30 s, silently).
MAX_EMAIL_RETRIES = 5
_BACKOFF_BASE_SECONDS = 30
_BACKOFF_CAP_SECONDS = 600


def email_retry_delay(retries: int) -> int:
    """Seconds to wait before retry number ``retries + 1`` (30 * 2**n, capped at 10 min)."""
    return min(_BACKOFF_BASE_SECONDS * (2 ** max(0, retries)), _BACKOFF_CAP_SECONDS)


def _retry_or_give_up(task, op: str, exc: BaseException, *, user, **ids) -> None:
    """Schedule the next attempt, or log one structured ERROR event when out of retries.

    ``ids`` are opaque row ids only - never the recipient address.
    """
    retries = task.request.retries
    if retries >= task.max_retries:
        attempts = retries + 1
        log_auth_event(
            None,
            op,
            "error",
            stage="give_up",
            user=user,
            error=exc,
            attempts=attempts,
            **ids,
        )
        logger.error(
            "%s gave up after %s attempts (user %s, %s)", op, attempts, user.pk, ids
        )
        return
    raise task.retry(exc=exc, countdown=email_retry_delay(retries))


def _newest_valid_verification_token(user):
    """Newest unused, unexpired token for ``user`` (>= 1 h of life), else a new one."""
    from account.models import EmailVerificationToken

    token = (
        EmailVerificationToken.objects.filter(
            user=user,
            is_used=False,
            expires_at__gt=timezone.now() + timedelta(hours=1),
        )
        .order_by("-created_at", "-pk")
        .first()
    )
    return token or EmailVerificationToken.objects.create(user=user)


@shared_task(
    bind=True,
    ignore_result=True,
    max_retries=MAX_EMAIL_RETRIES,
    default_retry_delay=30,
    acks_late=True,
    reject_on_worker_lost=True,
)
def send_verification_email_task(self, token_id: int) -> None:
    """Send an email-verification link; set email_sent_at on success.

    The mail always carries a *working* link: when the token it was queued for has
    been used or has expired in the meantime, the user's newest valid token (or a
    fresh one) is mailed instead. Verified users are skipped.
    """
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

    if not verification_token.is_valid():
        verification_token = _newest_valid_verification_token(user)
        log_auth_event(
            None,
            "verification_email",
            "success",
            stage="token_reissued",
            user=user,
            stale_id=token_id,
            verification_id=verification_token.pk,
        )

    frontend_url = get_public_frontend_base_url()
    verification_url = f"{frontend_url}/verify-email?token={verification_token.token}"
    try:
        email_sent = send_email_verification_email(
            to_email=user.email,
            user_name=user.get_display_name(),
            verification_url=verification_url,
        )
        failure: BaseException = RuntimeError("SMTP rejected verification email")
    except Exception as exc:  # template/connection problems must be retried too
        email_sent = False
        failure = exc
    if email_sent:
        verification_token.email_sent_at = timezone.now()
        verification_token.save(update_fields=["email_sent_at"])
        log_auth_event(
            None,
            "verification_email",
            "success",
            stage="sent",
            user=user,
            verification_id=verification_token.pk,
            attempt=self.request.retries + 1,
        )
        return
    logger.error(
        "Verification email failed for user %s (token %s)", user.pk, verification_token.pk
    )
    _retry_or_give_up(
        self,
        "verification_email",
        failure,
        user=user,
        verification_id=verification_token.pk,
    )


@shared_task(
    bind=True,
    ignore_result=True,
    max_retries=MAX_EMAIL_RETRIES,
    default_retry_delay=30,
    acks_late=True,
    reject_on_worker_lost=True,
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
    try:
        email_sent = send_email_verification_confirmation_email(
            to_email=user.email,
            user_name=user.get_display_name(),
            home_url=home_url,
        )
        failure: BaseException = RuntimeError("SMTP rejected confirmation email")
    except Exception as exc:
        email_sent = False
        failure = exc
    if not email_sent:
        logger.error("Confirmation email failed for user %s", user.pk)
        _retry_or_give_up(
            self, "verification_confirmation_email", failure, user=user
        )


@shared_task(
    bind=True,
    ignore_result=True,
    max_retries=MAX_EMAIL_RETRIES,
    default_retry_delay=30,
    acks_late=True,
    reject_on_worker_lost=True,
)
def send_password_reset_email_task(self, token_id: int) -> None:
    """Send the password-reset link (queued by the request, never sent inline)."""
    from account.email_utils import send_password_reset_email
    from account.frontend_urls import get_public_frontend_base_url
    from account.models import PasswordResetToken

    try:
        reset_token = PasswordResetToken.objects.select_related("user").get(pk=token_id)
    except PasswordResetToken.DoesNotExist:
        logger.error("Password reset token %s not found for email task", token_id)
        return
    user = reset_token.user
    if not reset_token.is_valid():
        # Used or expired while queued: the customer must ask for a new link.
        log_auth_event(
            None,
            "password_reset_email",
            "rejected",
            stage="token_invalid",
            user=user,
            reset_id=token_id,
        )
        return

    reset_url = f"{get_public_frontend_base_url()}/reset-password?token={reset_token.token}"
    try:
        email_sent = send_password_reset_email(
            to_email=user.email,
            user_name=user.get_display_name(),
            reset_url=reset_url,
        )
        failure: BaseException = RuntimeError("SMTP rejected password reset email")
    except Exception as exc:
        email_sent = False
        failure = exc
    if email_sent:
        log_auth_event(
            None,
            "password_reset_email",
            "success",
            stage="sent",
            user=user,
            reset_id=token_id,
            attempt=self.request.retries + 1,
        )
        return
    logger.error("Password reset email failed for user %s (token %s)", user.pk, token_id)
    _retry_or_give_up(
        self,
        "password_reset_email",
        failure,
        user=user,
        reset_id=token_id,
    )


@shared_task(
    bind=True,
    ignore_result=True,
    max_retries=MAX_EMAIL_RETRIES,
    default_retry_delay=30,
    acks_late=True,
    reject_on_worker_lost=True,
)
def send_password_reset_confirmation_email_task(self, user_id: int) -> None:
    """Tell the customer their password was changed."""
    from account.email_utils import send_password_reset_confirmation_email
    from account.frontend_urls import get_public_frontend_base_url
    from account.models import CustomUser

    try:
        user = CustomUser.objects.get(pk=user_id)
    except CustomUser.DoesNotExist:
        logger.error("User %s not found for password reset confirmation task", user_id)
        return

    login_url = f"{get_public_frontend_base_url()}/auth"
    try:
        email_sent = send_password_reset_confirmation_email(
            to_email=user.email,
            user_name=user.get_display_name(),
            login_url=login_url,
        )
        failure: BaseException = RuntimeError("SMTP rejected password reset confirmation")
    except Exception as exc:
        email_sent = False
        failure = exc
    if not email_sent:
        logger.error("Password reset confirmation email failed for user %s", user.pk)
        _retry_or_give_up(
            self, "password_reset_confirmation_email", failure, user=user
        )


UNSENT_VERIFICATION_ALERT_AFTER = timedelta(minutes=10)
EXPIRED_TOKEN_RETENTION = timedelta(days=30)


@shared_task(ignore_result=True)
def cleanup_expired_auth_tokens_task() -> None:
    """Drop long-expired password-reset and email-verification rows (beat).

    Kept for ``EXPIRED_TOKEN_RETENTION`` after expiry, not deleted at expiry: an old link
    that still resolves lets a verified customer who reopens it be told "already
    verified" instead of "invalid link".
    """
    from account.models import EmailVerificationToken, PasswordResetToken

    cutoff = timezone.now() - EXPIRED_TOKEN_RETENTION
    reset_deleted = PasswordResetToken.objects.filter(expires_at__lt=cutoff).delete()[0]
    verify_deleted = EmailVerificationToken.objects.filter(expires_at__lt=cutoff).delete()[0]
    log_auth_event(
        None,
        "token_cleanup",
        "success",
        stage="expired",
        reset_deleted=reset_deleted,
        verify_deleted=verify_deleted,
    )


@shared_task(ignore_result=True)
def alert_unsent_verification_emails_task() -> None:
    """ERROR when a verification token has never been mailed after 10 minutes."""
    from account.models import EmailVerificationToken

    cutoff = timezone.now() - UNSENT_VERIFICATION_ALERT_AFTER
    stuck = EmailVerificationToken.objects.filter(
        email_sent_at__isnull=True,
        is_used=False,
        created_at__lt=cutoff,
        user__is_email_verified=False,
        user__is_active=True,
    )
    count = stuck.count()
    if not count:
        return
    sample_ids = list(stuck.order_by("pk").values_list("pk", flat=True)[:20])
    logger.error(
        "Verification emails not sent: %s token(s) still have email_sent_at NULL "
        "after %s minutes (sample token ids %s)",
        count,
        int(UNSENT_VERIFICATION_ALERT_AFTER.total_seconds() // 60),
        sample_ids,
    )
    log_auth_event(
        None,
        "verification_email",
        "error",
        stage="unsent_stale",
        count=count,
        sample_ids=sample_ids,
    )


def _email_queue_message_count() -> int | None:
    """Ready messages on the transactional-mail queue, or None if the broker is down.

    Redis/Kombu does not create a queue until a consumer or publisher binds it.
    A missing queue is an empty backlog (0), not a broker failure.
    """
    from amqp.exceptions import ChannelError
    from celery import current_app
    from django.conf import settings

    queue_name = getattr(settings, "EMAIL_QUEUE_NAME", "email")
    try:
        with current_app.connection_or_acquire() as conn:
            return conn.default_channel.queue_declare(
                queue=queue_name, passive=True
            ).message_count
    except ChannelError as exc:
        # 404 NOT_FOUND: queue has never been declared (no mail waiting).
        if getattr(exc, "code", None) == 404 or "NOT_FOUND" in str(exc):
            return 0
        logger.warning("Could not inspect email queue %s", queue_name, exc_info=True)
        return None
    except Exception:
        logger.warning("Could not inspect email queue %s", queue_name, exc_info=True)
        return None


@shared_task(ignore_result=True)
def alert_email_queue_backlog_task() -> None:
    """ERROR when the email queue has piled up (workers down or SES stalling)."""
    from django.conf import settings

    threshold = int(getattr(settings, "EMAIL_QUEUE_BACKLOG_ALERT", 100))
    count = _email_queue_message_count()
    if count is None or count < threshold:
        return
    logger.error(
        "Email queue backlog: %s ready message(s) (threshold %s). "
        "Scale celery-email or check SES sending quota.",
        count,
        threshold,
    )
    log_auth_event(
        None,
        "email_queue",
        "error",
        stage="backlog",
        count=count,
        threshold=threshold,
    )
