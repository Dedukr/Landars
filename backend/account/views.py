import hashlib
import ipaddress
import logging
import time
from datetime import timedelta

import jwt as pyjwt
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.middleware.csrf import get_token
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status, serializers
from rest_framework.authtoken.models import Token
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.exceptions import APIException, PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)
from rest_framework_simplejwt.settings import api_settings as jwt_api_settings
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.utils import datetime_from_epoch
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.db import IntegrityError, transaction

from .api_errors import error_response
from .email_normalization import normalize_email
from .jwt_cookies import (
    clear_refresh_cookie,
    refresh_cookie_name,
    set_refresh_cookie,
)
from .latin_validation import LATIN_SCRIPT_ERROR, is_latin_script_text
from .observability import get_client_ip, get_request_id, log_auth_event
from .tasks import (
    send_password_reset_confirmation_email_task,
    send_password_reset_email_task,
    send_verification_confirmation_email_task,
    send_verification_email_task,
)
from .throttles import (  # noqa: F401  (re-exported: tests import them from here)
    EmailVerificationResendIpThrottle,
    EmailVerificationResendThrottle,
    EmailVerificationThrottle,
    FailOpenAnonRateThrottle,
    FailOpenUserRateThrottle,
    LoginEmailThrottle,
    LoginThrottle,
    PasswordResetEmailThrottle,
    PasswordResetThrottle,
    RegisterEmailThrottle,
    RegisterThrottle,
)
from .email_validators import validate_email_comprehensive, validate_email_field
from .name_utils import split_legacy_name
from .user_payload import user_payload, user_profile_payload
from .models import (
    Address,
    CustomUser,
    EmailVerificationToken,
    PasswordResetToken,
    PaymentInformation,
    Profile,
)
from .serializers import PaymentInformationListSerializer, PaymentInformationSerializer

# Configure logger for security events
logger = logging.getLogger("account")

# --- small request helpers ---------------------------------------------------------


def _data(request) -> dict:
    """Request body as a mapping; a JSON list/number/string body counts as empty."""
    data = request.data
    return data if hasattr(data, "get") else {}


def _text(value) -> str:
    """Stripped string, or "" for anything that is not a string (null, number, list)."""
    return value.replace("\x00", "").strip() if isinstance(value, str) else ""


def _raw_text(value) -> str:
    """Like ``_text`` but never strips (passwords keep their spaces).

    NUL characters are dropped: PostgreSQL rejects them in text parameters (a 500).
    """
    return value.replace("\x00", "") if isinstance(value, str) else ""


class _UserRef:
    """Just enough of a user for ``log_auth_event`` when only the id is known."""

    def __init__(self, pk):
        self.pk = pk


def _user_ref(user_id):
    return _UserRef(user_id) if user_id is not None else None


def _access_and_refresh(user):
    """Access JWT (JSON) plus refresh string for the httpOnly cookie."""
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


def _request_id_of(request) -> str:
    candidate = getattr(request, "request_id", None)
    return candidate if isinstance(candidate, str) and candidate else get_request_id()


def _ip_for_db(request):
    """Real client IP for ``ip_address`` columns; None when unknown/unparseable."""
    ip = get_client_ip(request)
    try:
        return str(ipaddress.ip_address(ip)) if ip else None
    except ValueError:
        return None


def _user_agent(request) -> str:
    return (request.META.get("HTTP_USER_AGENT") or "")[:500]


def _validation_error(request, op, message, field=None, *, email=None):
    log_auth_event(
        request, op, "rejected", stage="validation", status=400, email=email, field=field
    )
    return error_response(
        request,
        message,
        code="validation_error",
        status_code=status.HTTP_400_BAD_REQUEST,
        field=field,
    )


def _server_error(request, op, exc, message):
    logger.exception("Unexpected error in %s", op)
    log_auth_event(
        request, op, "error", stage="unexpected", status=500, error=exc
    )
    return error_response(
        request,
        message,
        code="server_error",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


def _find_user_by_email(email: str):
    """User for a normalised email: exact match first, else case-insensitive lowest id.

    Never raises MultipleObjectsReturned (legacy databases can hold case-duplicates).
    """
    if not email:
        return None
    user = CustomUser.objects.filter(email=email).order_by("pk").first()
    if user is None:
        user = CustomUser.objects.filter(email__iexact=email).order_by("pk").first()
    return user


# --- verification e-mail queueing -------------------------------------------------


def _try_enqueue_verification_email(token_id: int) -> bool:
    """Publish verification email task to Celery. Never sync-sends via SES."""
    try:
        send_verification_email_task.delay(token_id)
        return True
    except Exception:
        logger.exception(
            "Failed to enqueue verification email for token %s — "
            "user should use Resend verification",
            token_id,
        )
        return False


def _queue_verification_email(token_id: int) -> bool:
    """
    Enqueue verification email after DB commit.

    Never blocks the HTTP request on sync SES. Broker publish failures return
    False so the client can prompt Resend. Django runs on_commit immediately
    when not inside an atomic block (normal register/resend path after
    autocommit saves); Redis socket timeouts keep .delay() fail-fast.
    Callers must NOT hold an atomic block, otherwise the result is only a
    promise (see register: the user+token write commits first).
    """
    result: list[bool] = []

    def _enqueue() -> None:
        result.append(_try_enqueue_verification_email(token_id))

    transaction.on_commit(_enqueue)

    # Immediate when not in an atomic block; otherwise deferred until commit.
    if result:
        return result[0]
    # Still inside a surrounding atomic transaction: publish is scheduled.
    return True


def _verification_cooldown() -> int:
    return int(getattr(settings, "EMAIL_VERIFICATION_COOLDOWN", 60))


def _enqueue_guard_key(user, token) -> str:
    digest = hashlib.sha256(token.token.encode()).hexdigest()[:16]
    return f"verif_enq:{user.pk}:{digest}"


def _claim_verification_enqueue(user, token) -> bool:
    """True when nobody queued this token's mail during the cooldown (fail open)."""
    try:
        return bool(cache.add(_enqueue_guard_key(user, token), 1, _verification_cooldown()))
    except Exception:
        logger.warning("Verification enqueue guard unavailable", exc_info=True)
        return True


def _release_verification_enqueue(user, token) -> None:
    try:
        cache.delete(_enqueue_guard_key(user, token))
    except Exception:
        pass


def _verification_email_recently_sent(user) -> bool:
    since = timezone.now() - timedelta(seconds=_verification_cooldown())
    return EmailVerificationToken.objects.filter(
        user=user, email_sent_at__isnull=False, email_sent_at__gte=since
    ).exists()


def _get_or_create_verification_token(request, user, *, min_remaining=timedelta(hours=1)):
    """Newest valid token with enough life left, else a new one.

    Older tokens are never invalidated: an email that is still in flight (queued or
    delayed) must keep working when the customer clicks it.
    """
    with transaction.atomic():
        # Row lock on the user: N simultaneous resends must find the token the first one
        # created instead of each creating their own (and each queueing a mail).
        CustomUser.objects.select_for_update().filter(pk=user.pk).first()
        token = (
            EmailVerificationToken.objects.filter(
                user=user,
                is_used=False,
                expires_at__gt=timezone.now() + min_remaining,
            )
            .order_by("-created_at", "-pk")
            .first()
        )
        if token is not None:
            return token
        return EmailVerificationToken.objects.create(
            user=user, ip_address=_ip_for_db(request), user_agent=_user_agent(request)
        )


def _send_verification_link(user, token) -> bool:
    """Queue the verification mail unless one was sent/queued during the cooldown.

    Returns whether a mail is (truthfully) on its way: True also when an earlier
    mail inside the cooldown window is still being delivered.
    """
    if _verification_email_recently_sent(user) or not _claim_verification_enqueue(
        user, token
    ):
        return True
    queued = _queue_verification_email(token.pk)
    if not queued:
        _release_verification_enqueue(user, token)
    return queued


class VerifiedEmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """JWT obtain that enforces the same email-verification gate as login_view."""

    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        if user is not None and not getattr(user, "is_email_verified", True):
            raise serializers.ValidationError(
                "Please verify your email address before logging in."
            )
        return data


class VerifiedEmailTokenObtainPairView(TokenObtainPairView):
    serializer_class = VerifiedEmailTokenObtainPairSerializer
    throttle_classes = [LoginThrottle, LoginEmailThrottle]

    def finalize_response(self, request, response, *args, **kwargs):
        """Move refresh into httpOnly cookie; keep access in JSON for the SPA."""
        if response.status_code == 200 and isinstance(response.data, dict):
            refresh = response.data.pop("refresh", None)
            if refresh:
                set_refresh_cookie(response, refresh)
        return super().finalize_response(request, response, *args, **kwargs)


class EnforceCSRFAuthentication(SessionAuthentication):
    """
    Trigger DRF CSRF checks for cookie-authenticated refresh without requiring
    a Django session user (APIView is otherwise csrf_exempt).
    """

    def authenticate(self, request):
        self.enforce_csrf(request)
        return None


# --- refresh rotation with grace ---------------------------------------------------
#
# ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION blacklists the presented refresh
# token. Two tabs refreshing at the same moment both present the same cookie, so the
# loser used to get "Token is blacklisted" (401) and the SPA then logged the customer
# out. A successful rotation therefore leaves a short-lived marker; a token that is
# blacklisted *and* carries the marker (and is otherwise valid, for an active user) is
# honoured for JWT_REFRESH_ROTATION_GRACE_SECONDS with a fresh access token only (no
# second refresh token, so the browser keeps the winner's cookie). A token blacklisted
# by logout never has a marker and stays rejected.

_ROTATED_KEY = "jwt_rotated:%s"
_LOGOUT_KEY = "jwt_logout:%s"


def _refresh_grace_seconds() -> int:
    try:
        return max(0, int(getattr(settings, "JWT_REFRESH_ROTATION_GRACE_SECONDS", 0) or 0))
    except (TypeError, ValueError):
        return 0


def _peek_payload(raw_token) -> dict:
    """Claims of an *unverified* token; only ever used for cache keys / log hints."""
    try:
        payload = pyjwt.decode(raw_token, options={"verify_signature": False})
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def _peek_jti(raw_token) -> str | None:
    jti = _peek_payload(raw_token).get(jwt_api_settings.JTI_CLAIM)
    return jti if isinstance(jti, str) and jti else None


# A grace-path access token only has to bridge the stragglers of one refresh race.
_GRACE_ACCESS_LIFETIME = timedelta(minutes=5)


def _track_rotated_refresh(user, raw_refresh) -> None:
    """Record a freshly rotated refresh token as outstanding for ``user``.

    SimpleJWT 5.3 registers a refresh token as outstanding only at login; a rotated
    one stays invisible until it is blacklisted (and is then stored without a user).
    Without this row a password reset/change could not revoke live sessions.
    """
    try:
        payload = _peek_payload(raw_refresh)
        jti, exp = payload.get(jwt_api_settings.JTI_CLAIM), payload.get("exp")
        if not jti or not exp:
            return
        OutstandingToken.objects.get_or_create(
            jti=jti,
            defaults={
                "user": user,
                "token": raw_refresh,
                "created_at": timezone.now(),
                "expires_at": datetime_from_epoch(exp),
            },
        )
    except Exception:
        logger.warning("Rotated refresh token not tracked", exc_info=True)


def _revoke_refresh_sessions(user, *, keep_jti=None, end_grace=True) -> int:
    """Blacklist every live refresh token of ``user`` (optionally sparing one).

    Used after a password reset/change so a stolen session cannot outlive the
    recovery. ``end_grace`` also stops just-rotated tokens being honoured by the
    refresh grace window. Access tokens already issued stay valid until they expire
    (at most ``ACCESS_TOKEN_LIFETIME``).
    """
    revoked = 0
    with transaction.atomic():
        # A refresh in flight holds a row lock on its old token and is about to commit a
        # NEW one. Waiting on those locks first (statement 1) makes the query below
        # (statement 2, fresh snapshot) see that new token, so it is revoked too.
        list(
            OutstandingToken.objects.select_for_update(no_key=True)
            .filter(user=user, expires_at__gt=timezone.now())
            .values_list("pk", flat=True)
        )
        tokens = OutstandingToken.objects.filter(
            user=user, expires_at__gt=timezone.now(), blacklistedtoken__isnull=True
        )
        if keep_jti:
            tokens = tokens.exclude(jti=keep_jti)
        for token in tokens:
            _, created = BlacklistedToken.objects.get_or_create(token=token)
            revoked += 1 if created else 0
    if end_grace:
        try:
            cache.set(_LOGOUT_KEY % user.pk, time.time(), max(_refresh_grace_seconds(), 1))
        except Exception:
            logger.warning("Session revocation grace cleanup failed", exc_info=True)
    return revoked


class _GraceRefreshToken(RefreshToken):
    """Verifies signature, expiry and type but not the blacklist (grace path only)."""

    def check_blacklist(self) -> None:
        return None


class CookieTokenRefreshSerializer(TokenRefreshSerializer):
    """Accept refresh from JSON body (legacy) or httpOnly cookie."""

    refresh = serializers.CharField(required=False, allow_blank=False)

    def validate(self, attrs):
        request = self.context["request"]
        if not attrs.get("refresh"):
            cookie_token = request.COOKIES.get(refresh_cookie_name())
            if cookie_token:
                attrs["refresh"] = cookie_token
        raw = attrs.get("refresh")
        if not raw:
            request._refresh_stage = "no_cookie"
            raise InvalidToken("No valid refresh token found")

        jti = _peek_jti(raw)
        try:
            # One rotation at a time per refresh token: the losers of a race wait on the
            # row lock, then see the winner's blacklist entry and take the grace path
            # (the grace marker is written BEFORE the winner commits, so it is always
            # there by the time a waiter is released).
            with transaction.atomic():
                self._lock_token_row(raw, jti)
                data = self._rotate(attrs, request, jti)
        except TokenError as exc:
            blacklisted = "blacklisted" in str(exc).lower()
            graced = self._grace(request, raw, jti, blacklisted)
            if graced is not None:
                return graced
            request._refresh_stage = "blacklisted" if blacklisted else "invalid"
            raise
        if data is None:
            # Raised only now, after the rotation committed: a rejected refresh still spends
            # the token, so reactivating the account later does not revive the old cookie.
            request._refresh_stage = "inactive"
            raise InvalidToken("User not found or inactive")
        return data

    @staticmethod
    def _lock_token_row(raw, jti) -> None:
        """Row-lock the outstanding-token row of ``raw`` (PostgreSQL; a no-op on SQLite).

        Only for a token whose signature/expiry verify: junk tokens must not cause
        writes. A token SimpleJWT never recorded (rotated before this fix) gets its row
        created here; concurrent inserts of one jti then serialise on the unique index.

        ``no_key=True`` (FOR NO KEY UPDATE): still serialises concurrent rotations, but does
        not conflict with the FOR KEY SHARE lock a foreign-key check takes when a logout
        (or the rotation itself) inserts the BlacklistedToken row - a plain FOR UPDATE
        deadlocked against exactly that on PostgreSQL.
        """
        if not jti:
            return
        try:
            verified = _GraceRefreshToken(raw)  # signature / exp / type, no blacklist check
        except TokenError:
            return
        if OutstandingToken.objects.select_for_update(no_key=True).filter(jti=jti).first():
            return
        user_id = verified.payload.get(jwt_api_settings.USER_ID_CLAIM)
        if get_user_model().objects.filter(pk=user_id).exists():
            OutstandingToken.objects.get_or_create(
                jti=jti,
                defaults={
                    "user_id": user_id,
                    "token": raw,
                    "created_at": timezone.now(),
                    "expires_at": datetime_from_epoch(verified["exp"]),
                },
            )

    def _rotate(self, attrs, request, jti):
        data = super().validate(attrs)
        # The token verified, so its claims are trustworthy. SimpleJWT 5.3 does not check
        # that the user is still active on refresh (the access token would just be
        # unusable) - refuse to keep the session alive for a deactivated/deleted user.
        user_id = _peek_payload(attrs["refresh"]).get(jwt_api_settings.USER_ID_CLAIM)
        request._refresh_user_id = user_id
        user = (
            get_user_model()
            .objects.filter(**{jwt_api_settings.USER_ID_FIELD: user_id})
            .first()
        )
        if user is None or not jwt_api_settings.USER_AUTHENTICATION_RULE(user):
            return None  # spent, not renewed (see validate)
        if data.get("refresh"):
            _track_rotated_refresh(user, data["refresh"])
        if jti and data.get("refresh") and _refresh_grace_seconds() > 0:
            try:
                cache.set(_ROTATED_KEY % jti, time.time(), _refresh_grace_seconds())
            except Exception:
                logger.warning("Refresh grace marker not stored", exc_info=True)
        return data

    def _grace(self, request, raw, jti, blacklisted):
        grace = _refresh_grace_seconds()
        if grace <= 0 or not jti or not blacklisted:
            return None
        try:
            rotated_at = cache.get(_ROTATED_KEY % jti)
            if rotated_at is None:
                # The winning request may not have stored its marker yet.
                time.sleep(0.03)
                rotated_at = cache.get(_ROTATED_KEY % jti)
        except Exception:
            logger.warning("Refresh grace marker unavailable", exc_info=True)
            return None
        if rotated_at is None:
            return None
        try:
            token = _GraceRefreshToken(raw)
        except TokenError:
            return None
        user = (
            get_user_model()
            .objects.filter(
                **{
                    jwt_api_settings.USER_ID_FIELD: token.payload.get(
                        jwt_api_settings.USER_ID_CLAIM
                    )
                }
            )
            .first()
        )
        if user is None or not jwt_api_settings.USER_AUTHENTICATION_RULE(user):
            return None
        try:
            logged_out_at = cache.get(_LOGOUT_KEY % user.pk)
        except Exception:
            logged_out_at = None
        if logged_out_at is not None and logged_out_at >= rotated_at:
            return None  # the customer logged out after that rotation
        request._refresh_stage = "grace_reuse"
        request._refresh_user_id = user.pk
        access = token.access_token
        # Short-lived on purpose: it only bridges the stragglers of one refresh race.
        access.set_exp(lifetime=_GRACE_ACCESS_LIFETIME)
        return {"access": str(access)}


class CookieTokenRefreshView(TokenRefreshView):
    """Refresh access token; rotate refresh into httpOnly cookie."""

    serializer_class = CookieTokenRefreshSerializer
    authentication_classes = [EnforceCSRFAuthentication]

    def handle_exception(self, exc):
        if isinstance(exc, PermissionDenied):  # raised by the CSRF check
            log_auth_event(
                self.request, "refresh", "rejected", stage="csrf", status=403
            )
        return super().handle_exception(exc)

    def post(self, request, *args, **kwargs):
        try:
            response = super().post(request, *args, **kwargs)
        except InvalidToken:
            log_auth_event(
                request,
                "refresh",
                "rejected",
                stage=getattr(request, "_refresh_stage", "invalid"),
                status=401,
            )
            raise
        stage = getattr(request, "_refresh_stage", None)
        log_auth_event(
            request,
            "refresh",
            "success",
            stage="grace_reuse" if stage == "grace_reuse" else "success",
            status=response.status_code,
            user=_user_ref(getattr(request, "_refresh_user_id", None)),
        )
        return response

    def finalize_response(self, request, response, *args, **kwargs):
        # Grace-path responses carry only "access": no refresh, so no cookie change.
        if response.status_code == 200 and isinstance(response.data, dict):
            refresh = response.data.pop("refresh", None)
            if refresh:
                set_refresh_cookie(response, refresh)
        return super().finalize_response(request, response, *args, **kwargs)


# Create your views here.


class _DuplicateEmail(Exception):
    """create_user lost the uniqueness race / found an existing row."""


class _RegisterRejected(Exception):
    def __init__(self, message, field=None):
        super().__init__(message)
        self.message = message
        self.field = field


_EMAIL_EXISTS_MESSAGE = (
    "A user with this email address already exists. "
    "Please use a different email or try logging in."
)


def _register_body(user, email_queued: bool, resumed: bool) -> dict:
    return {
        "message": (
            "User created successfully. Please check your email to verify your account."
            if email_queued
            else "User created successfully, but we could not send the verification email. Please use Resend verification from the sign-in page."
        ),
        "email_verification_required": True,
        "email_queued": email_queued,
        "email_sent": False,
        "resumed": resumed,
        "user": user_payload(user),
    }


def _register_existing(request, existing, email, password):
    """Email already registered: resume an unverified twin, otherwise say it exists.

    A retry after a lost response (or the loser of a double-submit race) presents the
    same email *and* password of a still-unverified account; that customer gets a
    normal 201 instead of a misleading "already exists". Anything else is a real
    conflict and reveals nothing beyond what the endpoint always did.
    """
    if (
        existing.is_email_verified
        or not existing.is_active
        or not existing.check_password(password)
    ):
        log_auth_event(
            request, "register", "rejected", stage="duplicate", status=400, email=email
        )
        return error_response(
            request,
            _EMAIL_EXISTS_MESSAGE,
            code="email_exists",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    token = _get_or_create_verification_token(request, existing)
    email_queued = _send_verification_link(existing, token)
    log_auth_event(
        request,
        "register",
        "success",
        stage="resumed",
        status=201,
        user=existing,
        email=email,
        queued=email_queued,
    )
    return Response(
        _register_body(existing, email_queued, resumed=True),
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([RegisterThrottle, RegisterEmailThrottle])
def register(request):
    """Register a new user; safe to retry (a lost response resumes the same account)."""
    try:
        data = _data(request)
        email = normalize_email(data.get("email"))
        password = _raw_text(data.get("password"))
        first_name = _text(data.get("first_name"))
        surname = _text(data.get("surname"))
        legacy_name = _text(data.get("name"))

        if not first_name and not surname and legacy_name:
            first_name, surname = split_legacy_name(legacy_name)
            first_name = first_name or ""
            surname = surname or ""

        for field, value in (
            ("email", email),
            ("password", password),
            ("first_name", first_name),
            ("surname", surname),
        ):
            if not value:
                return _validation_error(
                    request,
                    "register",
                    "Email, password, first name, and surname are required",
                    field,
                    email=email,
                )

        if not is_latin_script_text(first_name):
            return _validation_error(
                request,
                "register",
                f"First name: {LATIN_SCRIPT_ERROR}",
                "first_name",
                email=email,
            )
        if not is_latin_script_text(surname):
            return _validation_error(
                request,
                "register",
                f"Surname: {LATIN_SCRIPT_ERROR}",
                "surname",
                email=email,
            )

        # Comprehensive email validation
        is_valid, error_message, warning_message = validate_email_field(
            email, allow_disposable=False
        )
        if not is_valid:
            return _validation_error(
                request, "register", error_message, "email", email=email
            )
        if warning_message:
            logger.info("Email validation warning on register: %s", warning_message)

        # Validate password strength using Django's validators
        try:
            validate_password(password)
        except ValidationError as e:
            return _validation_error(
                request, "register", " ".join(e.messages), "password", email=email
            )

        existing = _find_user_by_email(email)
        if existing is not None:
            return _register_existing(request, existing, email, password)

        # User + verification token are one unit: if the token cannot be stored the
        # user row is rolled back too, so a retry starts clean instead of hitting a
        # half-created account ("already exists" for an account nobody can verify).
        try:
            with transaction.atomic():
                try:
                    user = CustomUser.objects.create_user(
                        email=email,
                        password=password,
                        first_name=first_name,
                        surname=surname,
                        is_email_verified=False,
                        created_source=CustomUser.CREATED_SOURCE_WEBSITE,
                    )
                except (ValueError, ValidationError, IntegrityError) as exc:
                    text = str(exc).lower()
                    if isinstance(exc, IntegrityError) or "already exists" in text:
                        raise _DuplicateEmail() from exc
                    if isinstance(exc, ValidationError):
                        raise _RegisterRejected(" ".join(exc.messages), "email") from exc
                    raise
                verification_token = EmailVerificationToken.objects.create(
                    user=user,
                    ip_address=_ip_for_db(request),
                    user_agent=_user_agent(request),
                )
        except _DuplicateEmail:
            # A twin request (double click, retry, other tab) won the race. The
            # atomic block has already rolled back, so it is safe to query again.
            existing = _find_user_by_email(email)
            if existing is None:
                log_auth_event(
                    request,
                    "register",
                    "rejected",
                    stage="duplicate",
                    status=400,
                    email=email,
                    resolved=False,
                )
                return error_response(
                    request,
                    _EMAIL_EXISTS_MESSAGE,
                    code="email_exists",
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            return _register_existing(request, existing, email, password)
        except _RegisterRejected as rejected:
            return _validation_error(
                request, "register", rejected.message, rejected.field, email=email
            )

        # Outside the atomic block: the result now reflects a real broker publish.
        email_queued = _send_verification_link(user, verification_token)

        log_auth_event(
            request,
            "register",
            "success",
            stage="created",
            status=201,
            user=user,
            email=email,
            queued=email_queued,
        )

        return Response(
            _register_body(user, email_queued, resumed=False),
            status=status.HTTP_201_CREATED,
        )

    except APIException:
        raise
    except Exception as e:
        return _server_error(
            request, "register", e, "An error occurred during registration"
        )


_LOGIN_MAX_CANDIDATES = 5


def _login_candidates(email: str) -> list:
    """Rows matching the email: exact match first, then case-insensitive, by id."""
    exact = list(
        CustomUser.objects.filter(email=email).order_by("pk")[:_LOGIN_MAX_CANDIDATES]
    )
    rest_limit = _LOGIN_MAX_CANDIDATES - len(exact)
    rest = []
    if rest_limit > 0:
        rest = list(
            CustomUser.objects.filter(email__iexact=email)
            .exclude(pk__in=[u.pk for u in exact])
            .order_by("pk")[:rest_limit]
        )
    return exact + rest


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle, LoginEmailThrottle])
def login_view(request):
    """Login a user with enhanced security"""
    try:
        data = _data(request)
        email = normalize_email(data.get("email"))
        password = _raw_text(data.get("password"))

        if not email or not password:
            return _validation_error(
                request,
                "login",
                "Email and password are required",
                "email" if not email else "password",
                email=email,
            )

        # Legacy databases can hold case-duplicate rows: never assume one match.
        candidates = _login_candidates(email)
        if not candidates:
            log_auth_event(
                request,
                "login",
                "rejected",
                stage="unknown_email",
                status=401,
                email=email,
            )
            return error_response(
                request,
                "No account found with this email address. Would you like to create an account?",
                code="account_not_found",
                status_code=status.HTTP_401_UNAUTHORIZED,
                suggestion="create_account",
            )
        if len(candidates) > 1:
            log_auth_event(
                request,
                "login",
                "error",
                stage="duplicate_email_rows",
                email=email,
                level=logging.WARNING,
                candidate_user_ids=[u.pk for u in candidates],
            )

        # Check each row's own password (ModelBackend would resolve every variant of
        # the address to the same row). Inactive rows never authenticate.
        user = None
        inactive_password_match = False
        for candidate in candidates:
            if not candidate.check_password(password):
                continue
            if candidate.is_active:
                user = candidate
                break
            inactive_password_match = True

        if user is None:
            if inactive_password_match:
                log_auth_event(
                    request,
                    "login",
                    "rejected",
                    stage="inactive",
                    status=403,
                    email=email,
                )
                return error_response(
                    request,
                    "This account is inactive. Please contact support if you think this is a mistake.",
                    code="account_inactive",
                    status_code=status.HTTP_403_FORBIDDEN,
                )
            log_auth_event(
                request,
                "login",
                "rejected",
                stage="password_check",
                status=401,
                email=email,
            )
            return error_response(
                request,
                "Invalid password for this email address",
                code="invalid_password",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        # Check if email verification is required
        if not user.is_email_verified:
            log_auth_event(
                request,
                "login",
                "rejected",
                stage="unverified",
                status=200,
                user=user,
                email=email,
            )
            return Response(
                {
                    "message": "Please verify your email address before logging in",
                    "code": "email_not_verified",
                    "email_verification_required": True,
                    "user": user_payload(user),
                    "request_id": _request_id_of(request),
                },
                status=status.HTTP_200_OK,
            )

        # Update last login (never block a valid sign-in on this bookkeeping write)
        try:
            user.last_login = timezone.now()
            user.save(update_fields=["last_login"])
        except Exception:
            logger.warning("Could not update last_login for user %s", user.pk, exc_info=True)

        log_auth_event(
            request,
            "login",
            "success",
            stage="success",
            status=200,
            user=user,
            email=email,
        )

        # Access stays in JSON (SPA memory/sessionStorage); refresh in httpOnly cookie.
        access, refresh = _access_and_refresh(user)
        response = Response(
            {
                "message": "Login successful",
                "access": access,
                "user": user_payload(user, include_staff=True),
            },
            status=status.HTTP_200_OK,
        )
        set_refresh_cookie(response, refresh)
        return response

    except APIException:
        raise
    except Exception as e:
        return _server_error(request, "login", e, "An error occurred during login")


def _refresh_from_request(request) -> str | None:
    """Refresh token from the body (legacy clients) or the httpOnly cookie."""
    try:
        body_token = _data(request).get("refresh")
    except Exception:  # unparseable body: the cookie may still be there
        body_token = None
    if isinstance(body_token, str) and body_token:
        return body_token
    cookie_token = request.COOKIES.get(refresh_cookie_name())
    return cookie_token or None


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def logout_view(request):
    """Logout: blacklist refresh (body or httpOnly cookie) and clear cookie.

    Never depends on the access token: a stale/garbage ``Authorization`` header used
    to yield 401 before this view ran, leaving the cookie (and session) in place.
    Always answers 200 and always clears the cookie.
    """
    user_id = None
    try:
        refresh_token = _refresh_from_request(request)
        if refresh_token:
            jti = _peek_jti(refresh_token)
            try:
                token = RefreshToken(refresh_token)
                user_id = token.payload.get(jwt_api_settings.USER_ID_CLAIM)
                token.blacklist()
            except Exception as exc:
                log_auth_event(
                    request,
                    "logout",
                    "rejected",
                    stage="blacklist_failed",
                    # An already-invalid/expired/blacklisted token is normal; anything
                    # else (e.g. a database outage) means the session was NOT revoked.
                    level=logging.INFO if isinstance(exc, TokenError) else logging.WARNING,
                    error=exc,
                )
            # A refresh that was rotated a moment ago must not be revivable
            # through the grace window once the customer has logged out.
            try:
                if jti:
                    cache.delete(_ROTATED_KEY % jti)
                if user_id is not None:
                    cache.set(
                        _LOGOUT_KEY % user_id,
                        time.time(),
                        max(_refresh_grace_seconds(), 1),
                    )
            except Exception:
                logger.warning("Logout grace cleanup failed", exc_info=True)
            if user_id is not None:
                Token.objects.filter(user_id=user_id).delete()

        log_auth_event(
            request, "logout", "success", stage="success", status=200, user=_user_ref(user_id)
        )
    except Exception as e:
        logger.exception("Unexpected error in logout")
        log_auth_event(request, "logout", "error", stage="unexpected", status=200, error=e)

    response = Response({"message": "Logout successful"}, status=status.HTTP_200_OK)
    clear_refresh_cookie(response)
    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def user_profile(request):
    """Get user profile - requires authentication"""
    try:
        return Response(user_profile_payload(request.user), status=status.HTTP_200_OK)
    except Exception:
        logger.exception("User profile error")
        return error_response(
            request,
            "Failed to retrieve user profile",
            code="server_error",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):
    """Change user password"""
    try:
        user = request.user
        data = _data(request)
        old_password = _raw_text(data.get("old_password"))
        new_password = _raw_text(data.get("new_password"))

        if not old_password or not new_password:
            return error_response(
                request,
                "Both old and new passwords are required",
                code="validation_error",
                status_code=status.HTTP_400_BAD_REQUEST,
                field="old_password" if not old_password else "new_password",
            )

        # Verify old password
        if not user.check_password(old_password):
            logger.warning("Failed password change attempt for user %s", user.pk)
            return error_response(
                request,
                "Old password is incorrect",
                code="invalid_password",
                status_code=status.HTTP_400_BAD_REQUEST,
                field="old_password",
            )

        # Validate new password
        try:
            validate_password(new_password, user=user)
        except ValidationError as e:
            return error_response(
                request,
                list(e.messages),
                code="validation_error",
                status_code=status.HTTP_400_BAD_REQUEST,
                field="new_password",
            )

        # Change password (only the password column: no full_clean on legacy rows)
        user.set_password(new_password)
        user.save(update_fields=["password"])

        # A password change ends every OTHER session (a stolen refresh token must not
        # survive it); this browser's own refresh cookie is spared.
        try:
            _revoke_refresh_sessions(
                user,
                keep_jti=_peek_jti(_refresh_from_request(request)),
                end_grace=False,
            )
        except Exception:
            logger.warning("Session revocation after password change failed", exc_info=True)

        logger.info("Password changed for user %s", user.pk)

        return Response(
            {"message": "Password changed successfully"},
            status=status.HTTP_200_OK,
        )

    except APIException:
        raise
    except Exception:
        logger.exception("Password change error")
        return error_response(
            request,
            "An error occurred while changing password",
            code="server_error",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["PUT", "PATCH"])
@permission_classes([IsAuthenticated])
def update_profile(request):
    """Update user profile information"""
    try:
        user = request.user
        data = _data(request)

        # Update user basic information
        if any(k in data for k in ("first_name", "surname", "name")):
            first_name = (
                _text(data.get("first_name"))
                if "first_name" in data
                else (user.first_name or "").strip()
            )
            surname = (
                _text(data.get("surname"))
                if "surname" in data
                else (user.surname or "").strip()
            )
            if "name" in data and not ("first_name" in data or "surname" in data):
                legacy = _text(data.get("name"))
                if legacy:
                    first_name, surname = split_legacy_name(legacy)
                    first_name = first_name or ""
                    surname = surname or ""
            if not first_name:
                return error_response(
                    request,
                    "First name is required",
                    code="validation_error",
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            if not surname:
                return error_response(
                    request,
                    "Surname is required",
                    code="validation_error",
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            from .latin_validation import LATIN_SCRIPT_ERROR, is_latin_script_text

            if not is_latin_script_text(first_name):
                return error_response(
                    request,
                    f"First name: {LATIN_SCRIPT_ERROR}",
                    code="validation_error",
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            if not is_latin_script_text(surname):
                return error_response(
                    request,
                    f"Surname: {LATIN_SCRIPT_ERROR}",
                    code="validation_error",
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            user.first_name = first_name
            user.surname = surname
            user.sync_computed_name()

        if "email" in data:
            email = normalize_email(data.get("email"))
            if not email:
                return error_response(
                    request,
                    "Email is required",
                    code="validation_error",
                    status_code=status.HTTP_400_BAD_REQUEST,
                    field="email",
                )
            if email != user.email:
                # Validate email format
                if "@" not in email or "." not in email.split("@")[-1]:
                    return error_response(
                        request,
                        "Please provide a valid email address",
                        code="validation_error",
                        status_code=status.HTTP_400_BAD_REQUEST,
                        field="email",
                    )
                # Case-insensitive: legacy rows may differ only by case
                if CustomUser.objects.filter(email__iexact=email).exclude(id=user.id).exists():
                    return error_response(
                        request,
                        "A user with this email already exists",
                        code="email_exists",
                        status_code=status.HTTP_400_BAD_REQUEST,
                        field="email",
                    )
                user.email = email

        try:
            with transaction.atomic():
                user.save()
        except ValidationError as exc:
            return error_response(
                request,
                " ".join(exc.messages) or "Please check the details you entered",
                code="validation_error",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        except IntegrityError:
            # Lost a uniqueness race on the e-mail (the pre-check passed for both requests).
            return error_response(
                request,
                "A user with this email already exists",
                code="email_exists",
                status_code=status.HTTP_400_BAD_REQUEST,
                field="email",
            )

        # Get or create profile

        profile, created = Profile.objects.get_or_create(user=user)

        # Update profile information
        if "phone" in data:
            profile.phone = _text(data.get("phone"))

        if "notes" in data:
            profile.notes = _text(data.get("notes"))

        # Handle address information (optional on profile; full checks at checkout)
        address_data = data.get("address", {})
        if address_data and isinstance(address_data, dict):
            from account.address_validation import validate_street_address

            address_line = (address_data.get("address_line") or "").strip()
            address_line2 = (address_data.get("address_line2") or "").strip()
            city = (address_data.get("city") or "").strip()
            postal_code = (address_data.get("postal_code") or "").strip()
            street_errors = validate_street_address(
                address_line=address_line,
                address_line2=address_line2,
                city=city,
                postal_code=postal_code,
                require_line2=False,
                require_complete=False,
            )
            if street_errors:
                return error_response(
                    request,
                    "Please fix address fields.",
                    code="validation_error",
                    status_code=status.HTTP_400_BAD_REQUEST,
                    errors=street_errors,
                )

            if profile.address:
                address = profile.address
            else:
                address = Address()

            address.address_line = address_line
            address.address_line2 = address_line2
            address.city = city
            address.postal_code = postal_code
            address.save()

            profile.address = address

        if "bill_use_delivery_address" in data:
            profile.bill_use_delivery_address = bool(
                data.get("bill_use_delivery_address", True)
            )

        from account.billing_address import (
            billing_payload_from_request,
            upsert_profile_billing_address,
            validate_billing_street,
        )

        has_billing_input = data.get("billing_address") is not None or any(
            key in data
            for key in (
                "bill_company_name",
                "bill_contact_name",
                "bill_address_line",
                "bill_address_line2",
                "bill_city",
                "bill_postal_code",
            )
        )
        if has_billing_input:
            billing_fields = billing_payload_from_request(data)
            if not profile.bill_use_delivery_address:
                street_errors = validate_billing_street(
                    billing_fields, require_complete=False
                )
                if street_errors:
                    return error_response(
                        request,
                        "Please fix billing address fields.",
                        code="validation_error",
                        status_code=status.HTTP_400_BAD_REQUEST,
                        errors=street_errors,
                    )
            upsert_profile_billing_address(profile, billing_fields)

        profile.save()

        logger.info("Profile updated for user %s", user.pk)

        profile_data = user_profile_payload(user)

        return Response(
            {"message": "Profile updated successfully", "profile": profile_data},
            status=status.HTTP_200_OK,
        )

    except APIException:
        raise
    except Exception:
        logger.exception("Profile update error")
        return error_response(
            request,
            "An error occurred while updating profile",
            code="server_error",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


def _enqueue_after_commit(request, op, task, arg, *, user=None) -> None:
    """Publish a Celery task once the surrounding transaction commits.

    Never sync-sends mail on the request path (django-ses has no timeouts) and a
    broker outage is logged, never surfaced: the endpoint keeps its generic answer.
    """

    def _publish() -> None:
        try:
            task.delay(arg)
        except Exception as exc:
            logger.exception("Failed to enqueue %s", op)
            log_auth_event(request, op, "error", stage="enqueue", user=user, error=exc)

    transaction.on_commit(_publish)


def _reusable_reset_token(user, min_remaining=timedelta(minutes=5)):
    """A still-valid reset token with enough life left (its mail may be in flight)."""
    return (
        PasswordResetToken.objects.filter(
            user=user, is_used=False, expires_at__gt=timezone.now() + min_remaining
        )
        .order_by("-created_at", "-pk")
        .first()
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetThrottle, PasswordResetEmailThrottle])
def request_password_reset(request):
    """Request password reset - queues the reset email (never sent inline)"""
    op = "password_reset_request"
    try:
        email = normalize_email(_data(request).get("email"))

        if not email:
            return _validation_error(request, op, "Email is required", "email")

        # Comprehensive email validation
        is_valid, error_message, warning_message = validate_email_field(
            email, allow_disposable=False
        )
        if not is_valid:
            return _validation_error(request, op, error_message, "email", email=email)
        if warning_message:
            logger.info("Email validation warning on password reset: %s", warning_message)

        cooldown_seconds = getattr(settings, "PASSWORD_RESET_COOLDOWN", 60)
        user = _find_user_by_email(email)

        # Recent request for this account? (creation time of its newest token)
        if user is not None:
            latest_request = (
                PasswordResetToken.objects.filter(
                    user=user,
                    created_at__gte=timezone.now() - timedelta(seconds=cooldown_seconds),
                )
                .order_by("-created_at")
                .first()
            )
            if latest_request is not None:
                remaining_cooldown = cooldown_seconds - (
                    timezone.now() - latest_request.created_at
                ).total_seconds()
                if remaining_cooldown > 0:
                    log_auth_event(
                        request,
                        op,
                        "rejected",
                        stage="cooldown",
                        status=429,
                        user=user,
                        email=email,
                        cooldown_remaining=int(remaining_cooldown),
                    )
                    return error_response(
                        request,
                        f"Please wait {int(remaining_cooldown)} seconds before requesting another reset link",
                        code="cooldown",
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        cooldown_remaining=int(remaining_cooldown),
                        cooldown_total=cooldown_seconds,
                    )

        if user is None:
            # Same answer as for a real account: never reveal which emails exist.
            log_auth_event(
                request, op, "success", stage="unknown_email", status=200, email=email
            )
        else:
            # Do NOT invalidate other valid tokens: an earlier mail may still be in
            # flight and its link must keep working. Reuse a healthy token instead.
            reset_token = _reusable_reset_token(user)
            if reset_token is None:
                reset_token = PasswordResetToken.objects.create(
                    user=user,
                    ip_address=_ip_for_db(request),
                    user_agent=_user_agent(request),
                )
            if _claim_reset_enqueue(user, reset_token, cooldown_seconds):
                _enqueue_after_commit(
                    request, op, send_password_reset_email_task, reset_token.pk, user=user
                )
                log_auth_event(
                    request, op, "success", stage="queued", status=200, user=user, email=email
                )
            else:
                log_auth_event(
                    request,
                    op,
                    "success",
                    stage="already_queued",
                    status=200,
                    user=user,
                    email=email,
                )

        # Always return success message regardless of whether user exists
        return Response(
            {
                "message": "If the email exists, a password reset link has been sent",
                "cooldown_total": cooldown_seconds,
                "next_request_allowed_in": cooldown_seconds,
            },
            status=status.HTTP_200_OK,
        )

    except APIException:
        raise
    except Exception as e:
        return _server_error(
            request, op, e, "An error occurred while processing your request"
        )


def _claim_reset_enqueue(user, token, cooldown_seconds) -> bool:
    """True unless this token's mail was already queued during the cooldown."""
    digest = hashlib.sha256(token.token.encode()).hexdigest()[:16]
    try:
        return bool(cache.add(f"reset_enq:{user.pk}:{digest}", 1, cooldown_seconds))
    except Exception:
        logger.warning("Password reset enqueue guard unavailable", exc_info=True)
        return True


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetThrottle])
def confirm_password_reset(request):
    """Confirm password reset with token and new password"""
    op = "password_reset_confirm"
    try:
        data = _data(request)
        token = _text(data.get("token"))
        new_password = _raw_text(data.get("new_password"))

        if not token or not new_password:
            return error_response(
                request,
                "Token and new password are required",
                code="validation_error",
                status_code=status.HTTP_400_BAD_REQUEST,
                field="new_password" if token else None,
            )

        with transaction.atomic():
            # Lock the token row so two concurrent submits cannot both consume it.
            try:
                reset_token = (
                    PasswordResetToken.objects.select_for_update(of=("self",))
                    .select_related("user")
                    .get(token=token)
                )
            except PasswordResetToken.DoesNotExist:
                log_auth_event(
                    request, op, "rejected", stage="token_invalid", status=400
                )
                return error_response(
                    request,
                    "Invalid or expired reset token",
                    code="token_invalid",
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

            user = reset_token.user
            if not reset_token.is_valid():
                log_auth_event(
                    request, op, "rejected", stage="token_expired", status=400, user=user
                )
                return error_response(
                    request,
                    "Invalid or expired reset token",
                    code="token_expired",
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

            # Validate new password
            try:
                validate_password(new_password, user=user)
            except ValidationError as e:
                log_auth_event(
                    request, op, "rejected", stage="validation", status=400, user=user
                )
                return error_response(
                    request,
                    list(e.messages),
                    code="validation_error",
                    status_code=status.HTTP_400_BAD_REQUEST,
                    field="new_password",
                )

            # The customer just proved they own this inbox: an unverified account
            # must be able to sign in with the new password (it was stuck before).
            was_unverified = not user.is_email_verified
            user.set_password(new_password)
            user.is_email_verified = True
            user.save(update_fields=["password", "is_email_verified"])

            # Mark the current token as used, then retire the rest.
            reset_token.mark_as_used()
            PasswordResetToken.invalidate_unused_user_tokens(user)

        # Recovery must end any session an attacker may hold (their refresh tokens
        # would otherwise keep rotating for up to 7 days).
        try:
            _revoke_refresh_sessions(user)
        except Exception:
            logger.warning("Session revocation after password reset failed", exc_info=True)

        _enqueue_after_commit(
            request, op, send_password_reset_confirmation_email_task, user.pk, user=user
        )

        log_auth_event(
            request,
            op,
            "success",
            stage="success",
            status=200,
            user=user,
            verified_now=was_unverified,
        )

        return Response(
            {"message": "Password has been reset successfully"},
            status=status.HTTP_200_OK,
        )

    except APIException:
        raise
    except Exception as e:
        return _server_error(
            request, op, e, "An error occurred while resetting your password"
        )


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([EmailVerificationThrottle])
def validate_password_reset_token(request):
    """Validate password reset token without resetting password"""
    op = "password_reset_validate"
    try:
        token = _text(request.GET.get("token"))

        if not token:
            return error_response(
                request,
                "Token is required",
                code="token_invalid",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # Find the reset token
        try:
            reset_token = PasswordResetToken.objects.select_related("user").get(token=token)
        except PasswordResetToken.DoesNotExist:
            log_auth_event(request, op, "rejected", stage="token_invalid", status=400)
            return error_response(
                request,
                "Invalid or expired reset token",
                code="token_invalid",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # Check if token is valid
        if not reset_token.is_valid():
            log_auth_event(
                request, op, "rejected", stage="token_expired", status=400,
                user=reset_token.user,
            )
            return error_response(
                request,
                "Invalid or expired reset token",
                code="token_expired",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # Return user info for the reset form
        return Response(
            {
                "valid": True,
                "user": user_payload(reset_token.user),
            },
            status=status.HTTP_200_OK,
        )

    except APIException:
        raise
    except Exception as e:
        return _server_error(
            request, op, e, "An error occurred while validating the token"
        )


@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
def csrf_token(request):
    """Get CSRF token for frontend"""
    return Response({"csrfToken": get_token(request)})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def payment_methods(request):
    """List and create payment methods for authenticated user"""
    try:
        if request.method == "GET":
            # List user's payment methods
            payment_methods = PaymentInformation.objects.filter(
                user=request.user, is_active=True
            ).order_by("-is_default", "-created_at")

            serializer = PaymentInformationListSerializer(payment_methods, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

        elif request.method == "POST":
            # Create new payment method
            data = request.data.copy()
            data["user"] = request.user.id

            # Parse expiry date if provided
            if "expiry_date" in data:
                expiry_date = data.pop("expiry_date")
                if "/" in expiry_date:
                    month, year = expiry_date.split("/")
                    data["expiry_month"] = int(month)
                    data["expiry_year"] = int("20" + year)  # Convert YY to 20YY

            # If this is the first payment method, make it default
            if not PaymentInformation.objects.filter(
                user=request.user, is_active=True
            ).exists():
                data["is_default"] = True

            serializer = PaymentInformationSerializer(data=data)
            if serializer.is_valid():
                serializer.save()
                logger.info(
                    f"Payment method created for user: {request.user.pk} from IP: {get_client_ip(request)}"
                )
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            else:
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    except Exception as e:
        logger.error(f"Payment methods error: {str(e)}")
        return Response(
            {"error": "An error occurred while processing payment methods"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def payment_method_detail(request, payment_id):
    """Retrieve, update, or delete a specific payment method"""
    try:
        try:
            payment_method = PaymentInformation.objects.get(
                id=payment_id, user=request.user, is_active=True
            )
        except PaymentInformation.DoesNotExist:
            return Response(
                {"error": "Payment method not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if request.method == "GET":
            serializer = PaymentInformationSerializer(payment_method)
            return Response(serializer.data, status=status.HTTP_200_OK)

        elif request.method in ["PUT", "PATCH"]:
            data = request.data.copy()

            # Parse expiry date if provided
            if "expiry_date" in data:
                expiry_date = data.pop("expiry_date")
                if "/" in expiry_date:
                    month, year = expiry_date.split("/")
                    data["expiry_month"] = int(month)
                    data["expiry_year"] = int("20" + year)  # Convert YY to 20YY

            serializer = PaymentInformationSerializer(
                payment_method, data=data, partial=request.method == "PATCH"
            )
            if serializer.is_valid():
                serializer.save()
                logger.info(
                    f"Payment method updated for user: {request.user.pk} from IP: {get_client_ip(request)}"
                )
                return Response(serializer.data, status=status.HTTP_200_OK)
            else:
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        elif request.method == "DELETE":
            # Soft delete by setting is_active to False
            payment_method.is_active = False
            payment_method.save()

            logger.info(
                f"Payment method deleted for user: {request.user.pk} from IP: {get_client_ip(request)}"
            )
            return Response(
                {"message": "Payment method deleted successfully"},
                status=status.HTTP_200_OK,
            )

    except Exception as e:
        logger.error(f"Payment method detail error: {str(e)}")
        return Response(
            {"error": "An error occurred while processing the payment method"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def set_default_payment_method(request, payment_id):
    """Set a payment method as default"""
    try:
        try:
            payment_method = PaymentInformation.objects.get(
                id=payment_id, user=request.user, is_active=True
            )
        except PaymentInformation.DoesNotExist:
            return Response(
                {"error": "Payment method not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Unset other default payment methods for this user
        PaymentInformation.objects.filter(
            user=request.user, is_default=True, is_active=True
        ).exclude(id=payment_id).update(is_default=False)

        # Set this payment method as default
        payment_method.is_default = True
        payment_method.save()

        logger.info(
            f"Default payment method set for user: {request.user.pk} from IP: {get_client_ip(request)}"
        )

        return Response(
            {"message": "Default payment method updated successfully"},
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        logger.error(f"Set default payment method error: {str(e)}")
        return Response(
            {"error": "An error occurred while setting default payment method"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([EmailVerificationThrottle])
def verify_email(request):
    """Verify user email with token (idempotent for already-verified users)"""
    op = "verify_email"
    try:
        token = _text(_data(request).get("token"))

        if not token:
            log_auth_event(request, op, "rejected", stage="no_token", status=400)
            return error_response(
                request,
                "Verification token is required",
                code="token_invalid",
                status_code=status.HTTP_400_BAD_REQUEST,
                can_resend=False,
            )

        with transaction.atomic():
            try:
                # No select_related("user"): with FOR UPDATE OF <token> PostgreSQL would
                # return the joined user row as of the statement start, i.e. stale for a
                # request that waited on the lock while another one verified the account.
                verification_token = EmailVerificationToken.objects.select_for_update(
                    of=("self",)
                ).get(token=token)
            except EmailVerificationToken.DoesNotExist:
                log_auth_event(request, op, "rejected", stage="token_invalid", status=400)
                return error_response(
                    request,
                    "Invalid or expired verification token",
                    code="token_invalid",
                    status_code=status.HTTP_400_BAD_REQUEST,
                    can_resend=False,
                )

            user = verification_token.user

            # Idempotent success: whatever state the link is in, a customer whose
            # email is already verified must not be told the link is broken.
            already_verified = user.is_email_verified
            if already_verified:
                if verification_token.is_valid():
                    verification_token.mark_as_used()
                    EmailVerificationToken.invalidate_unused_user_tokens(user)
            elif not verification_token.is_valid():
                log_auth_event(
                    request, op, "rejected", stage="token_expired", status=400, user=user
                )
                return error_response(
                    request,
                    "Verification token has expired or has already been used",
                    code="token_expired",
                    status_code=status.HTTP_400_BAD_REQUEST,
                    email=user.email,
                    can_resend=True,
                )
            else:
                verification_token.mark_as_used()
                EmailVerificationToken.invalidate_unused_user_tokens(user)
                user.is_email_verified = True
                user.save(update_fields=["is_email_verified"])

        if not already_verified:

            def _enqueue_confirmation() -> None:
                try:
                    send_verification_confirmation_email_task.delay(user.pk)
                except Exception:
                    logger.exception(
                        "Failed to enqueue confirmation email for user %s — "
                        "skipping (verification already succeeded)",
                        user.pk,
                    )

            # Never sync-send SES on the request path (same hang class as signup).
            transaction.on_commit(_enqueue_confirmation)

        # Verifying an email address never signs anyone in. A link that logs the browser
        # opening it into the account it belongs to is a login-CSRF / session-fixation
        # vector (an attacker registers their own address, sends the victim the link, and
        # the victim's browser lands in the attacker's account), and old links sitting in
        # inboxes would become login credentials. The page sends the customer to sign-in
        # with the address pre-filled instead.
        log_auth_event(
            request,
            op,
            "success",
            stage="already_verified" if already_verified else "verified",
            status=200,
            user=user,
        )
        return Response(
            {
                "message": "Email verified successfully",
                "already_verified": already_verified,
                "user": user_payload(user),
            },
            status=status.HTTP_200_OK,
        )

    except APIException:
        raise
    except Exception as e:
        return _server_error(
            request, op, e, "An error occurred during email verification"
        )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([EmailVerificationResendIpThrottle, EmailVerificationResendThrottle])
def resend_verification_email(request):
    """Resend the verification email (reuses a valid link, never kills one in flight)"""
    op = "resend_verification"
    try:
        email = normalize_email(_data(request).get("email"))

        if not email:
            return _validation_error(request, op, "Email address is required", "email")

        # Comprehensive email validation
        is_valid, error_message, warning_message = validate_email_field(
            email, allow_disposable=False
        )
        if not is_valid:
            return _validation_error(request, op, error_message, "email", email=email)
        if warning_message:
            logger.info("Email validation warning on resend: %s", warning_message)

        cooldown_seconds = _verification_cooldown()

        def _queued_body(email_queued: bool) -> dict:
            return {
                "message": "If the email exists and is unverified, a verification email has been sent",
                "cooldown_total": cooldown_seconds,
                "next_request_allowed_in": cooldown_seconds,
                "email_queued": email_queued,
            }

        user = _find_user_by_email(email)
        if user is None:
            # Same answer as for a real account: never reveal which emails exist.
            log_auth_event(
                request, op, "success", stage="unknown_email", status=200, email=email
            )
            return Response(_queued_body(True), status=status.HTTP_200_OK)

        if user.is_email_verified:
            log_auth_event(
                request,
                op,
                "success",
                stage="already_verified",
                status=200,
                user=user,
                email=email,
            )
            return Response(
                {"message": "Email is already verified", "already_verified": True},
                status=status.HTTP_200_OK,
            )

        # Only tokens whose email was actually sent start the cooldown.
        latest_sent = (
            EmailVerificationToken.objects.filter(
                user=user,
                email_sent_at__isnull=False,
                email_sent_at__gte=timezone.now() - timedelta(seconds=cooldown_seconds),
            )
            .order_by("-email_sent_at")
            .first()
        )
        if latest_sent is not None:
            remaining_cooldown = cooldown_seconds - (
                timezone.now() - latest_sent.email_sent_at
            ).total_seconds()
            if remaining_cooldown > 0:
                log_auth_event(
                    request,
                    op,
                    "rejected",
                    stage="cooldown",
                    status=429,
                    user=user,
                    email=email,
                    cooldown_remaining=int(remaining_cooldown),
                )
                return error_response(
                    request,
                    f"Please wait {int(remaining_cooldown)} seconds before requesting another verification email",
                    code="cooldown",
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    cooldown_remaining=int(remaining_cooldown),
                    cooldown_total=cooldown_seconds,
                )

        # Older tokens stay valid: the first email may still be queued or delayed and
        # its link must keep working (invalidating it made customers click "expired").
        verification_token = _get_or_create_verification_token(request, user)
        email_queued = _send_verification_link(user, verification_token)
        log_auth_event(
            request,
            op,
            "success" if email_queued else "error",
            stage="queued" if email_queued else "enqueue",
            status=200,
            user=user,
            email=email,
            queued=email_queued,
        )
        return Response(_queued_body(email_queued), status=status.HTTP_200_OK)

    except APIException:
        raise
    except Exception as e:
        return _server_error(
            request, op, e, "An error occurred while processing your request"
        )


@api_view(["POST"])
@permission_classes([AllowAny])
def debug_email(request):
    """Debug endpoint to test email handling — DEBUG only (not registered in production)."""
    if not settings.DEBUG:
        return Response(status=status.HTTP_404_NOT_FOUND)

    try:
        email = normalize_email(_data(request).get("email"))
        user = _find_user_by_email(email)
        if user is not None:
            return Response(
                {
                    "received_email": email,
                    "received_length": len(email),
                    "user_email": user.email,
                    "user_email_length": len(user.email) if user.email else 0,
                    "match": email == user.email,
                }
            )
        return Response(
            {
                "received_email": email,
                "received_length": len(email),
                "user_email": None,
                "user_email_length": 0,
                "match": False,
            }
        )
    except Exception as e:
        logger.error("DEBUG ENDPOINT ERROR: %s", e)
        return Response({"error": str(e)}, status=500)


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([EmailVerificationThrottle])
def check_verification_status(request):
    """Check if user's email is verified"""
    try:
        token = _text(request.GET.get("token"))

        if not token:
            return error_response(
                request,
                "Token is required",
                code="token_invalid",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # Find the verification token
        try:
            verification_token = EmailVerificationToken.objects.select_related("user").get(
                token=token
            )
        except EmailVerificationToken.DoesNotExist:
            return error_response(
                request,
                "Invalid verification token",
                code="token_invalid",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # Check if token is valid
        if not verification_token.is_valid():
            return error_response(
                request,
                "Verification token has expired or has already been used",
                code="token_expired",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        user = verification_token.user

        return Response(
            {
                "valid": True,
                "user": user_payload(user),
                "is_verified": user.is_email_verified,
            },
            status=status.HTTP_200_OK,
        )

    except Exception:
        logger.exception("Check verification status error")
        return error_response(
            request,
            "An error occurred while checking verification status",
            code="server_error",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
