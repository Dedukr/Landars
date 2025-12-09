import logging
from datetime import datetime, timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.mail import EmailMultiAlternatives
from django.middleware.csrf import get_token
from django.template.loader import render_to_string
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .email_utils import (
    send_email_verification_confirmation_email,
    send_email_verification_email,
    send_password_reset_confirmation_email,
    send_password_reset_email,
)
from .email_validators import validate_email_comprehensive, validate_email_field
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


# Custom throttle for registration
class RegisterThrottle(AnonRateThrottle):
    rate = "3/hour"


# Custom throttle for login
class LoginThrottle(AnonRateThrottle):
    rate = "5/minute"


# Custom throttle for password reset requests
class PasswordResetThrottle(AnonRateThrottle):
    rate = getattr(settings, "PASSWORD_RESET_RATE_LIMIT", "5/hour")


# Custom throttle for password reset by email
class PasswordResetEmailThrottle(UserRateThrottle):
    rate = getattr(settings, "PASSWORD_RESET_EMAIL_RATE_LIMIT", "3/hour")


# Custom throttle for email verification
class EmailVerificationThrottle(AnonRateThrottle):
    rate = getattr(settings, "EMAIL_VERIFICATION_RATE_LIMIT", "5/hour")


# Custom throttle for email verification resend
class EmailVerificationResendThrottle(AnonRateThrottle):
    rate = getattr(settings, "EMAIL_VERIFICATION_RESEND_RATE_LIMIT", "3/hour")


# Create your views here.


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([RegisterThrottle])
def register(request):
    """Register a new user with enhanced security"""
    try:
        data = request.data
        email = data.get("email", "").strip().lower()
        password = data.get("password", "")
        name = data.get("name", "").strip()

        # Input validation
        if not email or not password or not name:
            logger.warning(
                f"Registration attempt with missing fields from IP: {request.META.get('REMOTE_ADDR')}"
            )
            return Response(
                {"error": "Email, password, and name are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Comprehensive email validation
        is_valid, error_message, warning_message = validate_email_field(
            email, allow_disposable=False
        )

        if not is_valid:
            return Response(
                {"error": error_message},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Log warning if present
        if warning_message:
            logger.info(f"Email validation warning for {email}: {warning_message}")

        # Validate password strength using Django's validators
        try:
            validate_password(password)
        except ValidationError as e:
            return Response(
                {"error": list(e.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if user already exists (case-insensitive)
        if CustomUser.objects.filter(email__iexact=email).exists():
            logger.warning(
                f"Registration attempt with existing email: {email} from IP: {request.META.get('REMOTE_ADDR')}"
            )
            return Response(
                {
                    "error": "A user with this email address already exists. Please use a different email or try logging in."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if CustomUser.objects.filter(name=name).exists():
            return Response(
                {"error": "User with this name already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create new user (initially unverified)
        try:
            user = CustomUser.objects.create_user(
                name=name, email=email, password=password, is_email_verified=False
            )
        except ValueError as e:
            if "email already exists" in str(e):
                return Response(
                    {
                        "error": "A user with this email address already exists. Please use a different email or try logging in."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            else:
                raise e

        # Create email verification token with security context
        verification_token = EmailVerificationToken.objects.create(
            user=user,
            ip_address=request.META.get("REMOTE_ADDR"),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:500],  # Limit length
        )

        # Send verification email

        # Use URL_BASE configuration for consistent URL generation
        url_base = getattr(settings, "URL_BASE", "https://localhost")
        home_url = url_base  # Use URL_BASE directly as home_url

        # Extract base domain and construct frontend URL for verification

        frontend_url = url_base

        verification_url = (
            f"{frontend_url}/verify-email?token={verification_token.token}"
        )
        send_email_verification_email(
            to_email=email, user_name=name, verification_url=verification_url
        )
        # Set email_sent_at timestamp after successfully sending the email
        # This ensures cooldown starts when email is sent, not when button is pressed
        verification_token.email_sent_at = timezone.now()
        verification_token.save(update_fields=["email_sent_at"])

        # Log successful registration
        logger.info(
            f"New user registered: {email} from IP: {request.META.get('REMOTE_ADDR')}"
        )

        return Response(
            {
                "message": "User created successfully. Please check your email to verify your account.",
                "email_verification_required": True,
                "user": {"id": user.id, "name": user.name, "email": user.email},
            },
            status=status.HTTP_201_CREATED,
        )

    except Exception as e:
        logger.error(
            f"Registration error: {str(e)} from IP: {request.META.get('REMOTE_ADDR')}"
        )
        return Response(
            {"error": "An error occurred during registration"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def login_view(request):
    """Login a user with enhanced security"""
    try:
        data = request.data
        email = data.get("email", "").strip().lower()
        password = data.get("password", "")

        if not email or not password:
            logger.warning(
                f"Login attempt with missing credentials from IP: {request.META.get('REMOTE_ADDR')}"
            )
            return Response(
                {"error": "Email and password are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if user exists first
        try:
            user = CustomUser.objects.get(email=email)
        except CustomUser.DoesNotExist:
            logger.warning(
                f"Login attempt for non-existent email: {email} from IP: {request.META.get('REMOTE_ADDR')}"
            )
            return Response(
                {
                    "error": "No account found with this email address. Would you like to create an account?",
                    "suggestion": "create_account",
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Authenticate user (this will be checked by django-axes for lockout)
        authenticated_user = authenticate(request, username=email, password=password)

        if authenticated_user is None:
            logger.warning(
                f"Failed login attempt for email: {email} from IP: {request.META.get('REMOTE_ADDR')} (invalid password)"
            )
            return Response(
                {"error": "Invalid password for this email address"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Use the authenticated user
        user = authenticated_user

        if not user.is_active:
            logger.warning(
                f"Login attempt for inactive user: {email} from IP: {request.META.get('REMOTE_ADDR')}"
            )
            return Response(
                {"error": "Account is inactive"}, status=status.HTTP_401_UNAUTHORIZED
            )

        # Check if email verification is required
        if not user.is_email_verified:
            logger.info(
                f"Login attempt for unverified user: {email} from IP: {request.META.get('REMOTE_ADDR')}"
            )
            return Response(
                {
                    "message": "Please verify your email address before logging in",
                    "email_verification_required": True,
                    "user": {"id": user.id, "name": user.name, "email": user.email},
                },
                status=status.HTTP_200_OK,
            )

        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)

        # Update last login
        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])

        # Log successful login
        logger.info(
            f"Successful login for user: {email} from IP: {request.META.get('REMOTE_ADDR')}"
        )

        return Response(
            {
                "message": "Login successful",
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": {
                    "id": user.id,
                    "name": user.name,
                    "email": user.email,
                    "is_staff": user.is_staff,
                },
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        logger.error(
            f"Login error: {str(e)} from IP: {request.META.get('REMOTE_ADDR')}"
        )
        return Response(
            {"error": "An error occurred during login"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """Logout a user and blacklist refresh token"""
    try:
        # Blacklist the refresh token if provided
        refresh_token = request.data.get("refresh")
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except Exception:
                pass

        # Log logout
        if request.user.is_authenticated:
            logger.info(
                f"User logged out: {request.user.email} from IP: {request.META.get('REMOTE_ADDR')}"
            )
            # Delete old-style token if exists
            Token.objects.filter(user=request.user).delete()

        return Response({"message": "Logout successful"}, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"Logout error: {str(e)}")
        return Response(
            {"error": "An error occurred during logout"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def user_profile(request):
    """Get user profile - requires authentication"""
    try:
        user = request.user
        profile_data = {
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "last_login": user.last_login,
                "is_staff": user.is_staff,
            }
        }

        # Include profile information if it exists
        if hasattr(user, "profile"):
            profile = user.profile
            profile_data["profile"] = {
                "phone": profile.phone,
                "notes": profile.notes,
            }

            # Include address information if it exists
            if profile.address:
                address = profile.address
                profile_data["address"] = {
                    "address_line": address.address_line,
                    "address_line2": address.address_line2,
                    "city": address.city,
                    "postal_code": address.postal_code,
                }
            else:
                profile_data["address"] = None
        else:
            profile_data["profile"] = None
            profile_data["address"] = None

        return Response(profile_data, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"User profile error: {str(e)}")
        return Response(
            {"error": "Failed to retrieve user profile"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):
    """Change user password"""
    try:
        user = request.user
        old_password = request.data.get("old_password")
        new_password = request.data.get("new_password")

        if not old_password or not new_password:
            return Response(
                {"error": "Both old and new passwords are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify old password
        if not user.check_password(old_password):
            logger.warning(
                f"Failed password change attempt for user: {user.email} from IP: {request.META.get('REMOTE_ADDR')}"
            )
            return Response(
                {"error": "Old password is incorrect"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate new password
        try:
            validate_password(new_password, user=user)
        except ValidationError as e:
            return Response(
                {"error": list(e.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Change password
        user.set_password(new_password)
        user.save()

        logger.info(
            f"Password changed for user: {user.email} from IP: {request.META.get('REMOTE_ADDR')}"
        )

        return Response(
            {"message": "Password changed successfully"},
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        logger.error(f"Password change error: {str(e)}")
        return Response(
            {"error": "An error occurred while changing password"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["PUT", "PATCH"])
@permission_classes([IsAuthenticated])
def update_profile(request):
    """Update user profile information"""
    try:
        user = request.user
        data = request.data

        # Update user basic information
        if "name" in data:
            name = data.get("name", "").strip()
            if name and name != user.name:
                # Check if name is already taken by another user
                if CustomUser.objects.filter(name=name).exclude(id=user.id).exists():
                    return Response(
                        {"error": "A user with this name already exists"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                user.name = name

        if "email" in data:
            email = data.get("email", "").strip().lower()
            if email and email != user.email:
                # Validate email format
                if "@" not in email or "." not in email.split("@")[-1]:
                    return Response(
                        {"error": "Please provide a valid email address"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                # Check if email is already taken by another user
                if CustomUser.objects.filter(email=email).exclude(id=user.id).exists():
                    return Response(
                        {"error": "A user with this email already exists"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                user.email = email

        user.save()

        # Get or create profile

        profile, created = Profile.objects.get_or_create(user=user)

        # Update profile information
        if "phone" in data:
            profile.phone = data.get("phone", "").strip()

        if "notes" in data:
            profile.notes = data.get("notes", "").strip()

        # Handle address information
        address_data = data.get("address", {})
        if address_data:
            if profile.address:
                address = profile.address
            else:
                address = Address()

            address.address_line = address_data.get("address_line", "").strip()
            address.address_line2 = address_data.get("address_line2", "").strip()
            address.city = address_data.get("city", "").strip()
            address.postal_code = address_data.get("postal_code", "").strip()
            address.save()

            profile.address = address

        profile.save()

        # Log profile update
        logger.info(
            f"Profile updated for user: {user.email} from IP: {request.META.get('REMOTE_ADDR')}"
        )

        # Return updated profile data
        profile_data = {
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "last_login": user.last_login,
                "is_staff": user.is_staff,
            },
            "profile": {
                "phone": profile.phone,
                "notes": profile.notes,
            },
            "address": (
                {
                    "address_line": (
                        profile.address.address_line if profile.address else None
                    ),
                    "address_line2": (
                        profile.address.address_line2 if profile.address else None
                    ),
                    "city": profile.address.city if profile.address else None,
                    "postal_code": (
                        profile.address.postal_code if profile.address else None
                    ),
                }
                if profile.address
                else None
            ),
        }

        return Response(
            {"message": "Profile updated successfully", "profile": profile_data},
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        logger.error(f"Profile update error: {str(e)}")
        return Response(
            {"error": "An error occurred while updating profile"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetThrottle])
def request_password_reset(request):
    """Request password reset - sends reset email with enhanced security"""
    try:
        email = request.data.get("email", "").strip().lower()

        # Debug logging to track email value
        logger.info(
            f"DEBUG: Received email in request: '{email}' (length: {len(email)})"
        )

        if not email:
            return Response(
                {"error": "Email is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Comprehensive email validation
        is_valid, error_message, warning_message = validate_email_field(
            email, allow_disposable=False
        )

        if not is_valid:
            return Response(
                {"error": error_message},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Log warning if present
        if warning_message:
            logger.info(f"Email validation warning for {email}: {warning_message}")

        # Check for recent password reset requests to prevent abuse
        cooldown_seconds = getattr(settings, "PASSWORD_RESET_COOLDOWN", 60)
        recent_requests = PasswordResetToken.objects.filter(
            user__email=email,
            created_at__gte=timezone.now() - timedelta(seconds=cooldown_seconds),
        ).order_by("-created_at")

        if recent_requests.exists():
            latest_request = recent_requests.first()
            time_since_request = (
                timezone.now() - latest_request.created_at
            ).total_seconds()
            remaining_cooldown = cooldown_seconds - time_since_request

            if remaining_cooldown > 0:
                logger.warning(
                    f"Password reset cooldown violation for email: {email} from IP: {request.META.get('REMOTE_ADDR')} - {remaining_cooldown:.0f}s remaining"
                )
                return Response(
                    {
                        "error": f"Please wait {int(remaining_cooldown)} seconds before requesting another reset link",
                        "cooldown_remaining": int(remaining_cooldown),
                        "cooldown_total": cooldown_seconds,
                    },
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )

        # Check if user exists
        logger.info(
            f"Password reset requested for email: {email} from IP: {request.META.get('REMOTE_ADDR')}"
        )

        user_exists = False
        try:
            user = CustomUser.objects.get(email=email)
            user_exists = True
            logger.info(f"User found: {user.email} - Sending reset email")
        except CustomUser.DoesNotExist:
            logger.info(f"User not found: {email} - Not sending email")

        # Only send email if user exists
        if user_exists:
            # Invalidate ALL existing reset tokens for this user (both used and unused)
            old_tokens_count = PasswordResetToken.invalidate_all_user_tokens(user)

            if old_tokens_count > 0:
                logger.info(
                    f"Invalidated {old_tokens_count} existing tokens for user: {user.email}"
                )

            # Create new reset token with security context
            reset_token = PasswordResetToken.objects.create(
                user=user,
                ip_address=request.META.get("REMOTE_ADDR"),
                user_agent=request.META.get("HTTP_USER_AGENT", "")[
                    :500
                ],  # Limit length
            )

            logger.info(
                f"Created new reset token for user: {user.email} (token: {reset_token.token[:8]}...)"
            )

            # Send reset email with HTML template
            # Use URL_BASE configuration for consistent URL generation
            url_base = getattr(settings, "URL_BASE", "https://localhost")

            reset_url = f"{url_base}/reset-password?token={reset_token.token}"
            login_url = f"{url_base}/auth"

            try:
                # Centralized SMTP utility handles connection reuse and templating
                send_password_reset_email(
                    to_email=user.email, user_name=user.name, reset_url=reset_url
                )
                logger.info(f"Password reset email sent to: {email}")
            except Exception as e:
                logger.error(
                    f"Failed to send password reset email to {email}: {str(e)}"
                )
                # Still return success to prevent information leakage

        # Always return success message regardless of whether user exists
        return Response(
            {
                "message": "If the email exists, a password reset link has been sent",
                "cooldown_total": cooldown_seconds,
                "next_request_allowed_in": cooldown_seconds,
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        logger.error(f"Password reset request error: {str(e)}")
        return Response(
            {"error": "An error occurred while processing your request"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetThrottle])
def confirm_password_reset(request):
    """Confirm password reset with token and new password"""
    try:
        token = request.data.get("token", "").strip()
        new_password = request.data.get("new_password", "")

        if not token or not new_password:
            return Response(
                {"error": "Token and new password are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Find the reset token
        try:
            reset_token = PasswordResetToken.objects.get(token=token)
        except PasswordResetToken.DoesNotExist:
            logger.warning(
                f"Invalid password reset token attempted from IP: {request.META.get('REMOTE_ADDR')}"
            )
            return Response(
                {"error": "Invalid or expired reset token"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if token is valid
        if not reset_token.is_valid():
            logger.warning(
                f"Expired password reset token attempted for user: {reset_token.user.email} from IP: {request.META.get('REMOTE_ADDR')}"
            )
            return Response(
                {"error": "Invalid or expired reset token"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate new password
        try:
            validate_password(new_password, user=reset_token.user)
        except ValidationError as e:
            return Response(
                {"error": list(e.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Update password
        reset_token.user.set_password(new_password)
        reset_token.user.save()

        # Mark the current token as used with timestamp
        reset_token.mark_as_used()

        # Invalidate ALL remaining reset tokens for this user (comprehensive cleanup)
        remaining_tokens_count = PasswordResetToken.invalidate_unused_user_tokens(
            reset_token.user
        )

        if remaining_tokens_count > 0:
            logger.info(
                f"Invalidated {remaining_tokens_count} remaining tokens for user: {reset_token.user.email}"
            )

        logger.info(f"Password successfully reset for user: {reset_token.user.email}")

        # Send confirmation email
        try:
            # Point to frontend for login page
            frontend_host = request.get_host().replace(":8000", ":3000")
            login_url = f"{request.scheme}://{frontend_host}/auth"
            send_password_reset_confirmation_email(
                to_email=reset_token.user.email,
                user_name=reset_token.user.name,
                login_url=login_url,
            )
            logger.info(
                f"Password reset confirmation email sent to: {reset_token.user.email}"
            )
        except Exception as e:
            logger.error(f"Failed to send password reset confirmation email: {str(e)}")
            # Don't fail the password reset if email fails

        logger.info(
            f"Password reset completed for user: {reset_token.user.email} from IP: {request.META.get('REMOTE_ADDR')}"
        )

        return Response(
            {"message": "Password has been reset successfully"},
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        logger.error(f"Password reset confirmation error: {str(e)}")
        return Response(
            {"error": "An error occurred while resetting your password"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([AllowAny])
def validate_password_reset_token(request):
    """Validate password reset token without resetting password"""
    try:
        token = request.GET.get("token", "").strip()

        if not token:
            return Response(
                {"error": "Token is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Find the reset token
        try:
            reset_token = PasswordResetToken.objects.get(token=token)
        except PasswordResetToken.DoesNotExist:
            return Response(
                {"error": "Invalid or expired reset token"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if token is valid
        if not reset_token.is_valid():
            return Response(
                {"error": "Invalid or expired reset token"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Return user info for the reset form
        return Response(
            {
                "valid": True,
                "user": {
                    "name": reset_token.user.name,
                    "email": reset_token.user.email,
                },
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        logger.error(f"Token validation error: {str(e)}")
        return Response(
            {"error": "An error occurred while validating the token"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
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
                    f"Payment method created for user: {request.user.email} from IP: {request.META.get('REMOTE_ADDR')}"
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
                    f"Payment method updated for user: {request.user.email} from IP: {request.META.get('REMOTE_ADDR')}"
                )
                return Response(serializer.data, status=status.HTTP_200_OK)
            else:
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        elif request.method == "DELETE":
            # Soft delete by setting is_active to False
            payment_method.is_active = False
            payment_method.save()

            logger.info(
                f"Payment method deleted for user: {request.user.email} from IP: {request.META.get('REMOTE_ADDR')}"
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
            f"Default payment method set for user: {request.user.email} from IP: {request.META.get('REMOTE_ADDR')}"
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
@permission_classes([AllowAny])
@throttle_classes([EmailVerificationThrottle])
def verify_email(request):
    """Verify user email with token - enhanced security implementation"""
    try:
        token = request.data.get("token", "").strip()

        if not token:
            logger.warning(
                f"Email verification attempt without token from IP: {request.META.get('REMOTE_ADDR')}"
            )
            return Response(
                {"error": "Verification token is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Find the verification token
        try:
            verification_token = EmailVerificationToken.objects.get(token=token)
        except EmailVerificationToken.DoesNotExist:
            logger.warning(
                f"Invalid email verification token attempted from IP: {request.META.get('REMOTE_ADDR')}"
            )
            return Response(
                {"error": "Invalid or expired verification token"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if token is valid and not expired
        if not verification_token.is_valid():
            logger.warning(
                f"Expired email verification token attempted for user: {verification_token.user.email} from IP: {request.META.get('REMOTE_ADDR')}"
            )
            return Response(
                {"error": "Verification token has expired or has already been used"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Mark token as used with timestamp
        verification_token.mark_as_used()

        # Invalidate ALL remaining verification tokens for this user (comprehensive cleanup)
        remaining_tokens_count = EmailVerificationToken.invalidate_unused_user_tokens(
            verification_token.user
        )

        if remaining_tokens_count > 0:
            logger.info(
                f"Invalidated {remaining_tokens_count} remaining verification tokens for user: {verification_token.user.email}"
            )

        # Verify user's email
        user = verification_token.user
        user.is_email_verified = True
        user.save()

        # Send confirmation email
        # Use URL_BASE configuration for consistent URL generation

        url_base = getattr(settings, "URL_BASE", "https://localhost")
        home_url = url_base  # Use URL_BASE directly as home_url

        send_email_verification_confirmation_email(
            to_email=user.email, user_name=user.name, home_url=home_url
        )

        # Log successful verification
        logger.info(
            f"Email verified for user: {user.email} from IP: {request.META.get('REMOTE_ADDR')}"
        )

        return Response(
            {
                "message": "Email verified successfully",
                "user": {"id": user.id, "name": user.name, "email": user.email},
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        logger.error(f"Email verification error: {str(e)}")
        return Response(
            {"error": "An error occurred during email verification"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([EmailVerificationResendThrottle])
def resend_verification_email(request):
    """Resend email verification for unverified users - enhanced security implementation"""
    try:
        email = request.data.get("email", "").strip().lower()

        # Debug logging to track email value
        logger.info(
            f"DEBUG: Received email in resend request: '{email}' (length: {len(email)})"
        )

        if not email:
            return Response(
                {"error": "Email address is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Comprehensive email validation
        is_valid, error_message, warning_message = validate_email_field(
            email, allow_disposable=False
        )

        if not is_valid:
            return Response(
                {"error": error_message},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Log warning if present
        if warning_message:
            logger.info(f"Email validation warning for {email}: {warning_message}")

        # Check for recent verification requests to prevent abuse
        # Only check tokens where email was actually sent (email_sent_at is not null)
        cooldown_seconds = getattr(settings, "EMAIL_VERIFICATION_COOLDOWN", 60)
        recent_requests = EmailVerificationToken.objects.filter(
            user__email=email,
            email_sent_at__isnull=False,
            email_sent_at__gte=timezone.now() - timedelta(seconds=cooldown_seconds),
        ).order_by("-email_sent_at")

        if recent_requests.exists():
            latest_request = recent_requests.first()
            time_since_request = (
                timezone.now() - latest_request.email_sent_at
            ).total_seconds()
            remaining_cooldown = cooldown_seconds - time_since_request

            if remaining_cooldown > 0:
                logger.warning(
                    f"Email verification cooldown violation for email: {email} from IP: {request.META.get('REMOTE_ADDR')} - {remaining_cooldown:.0f}s remaining"
                )
                return Response(
                    {
                        "error": f"Please wait {int(remaining_cooldown)} seconds before requesting another verification email",
                        "cooldown_remaining": int(remaining_cooldown),
                        "cooldown_total": cooldown_seconds,
                    },
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )

        # Check if user exists
        logger.info(
            f"Email verification resend requested for email: {email} from IP: {request.META.get('REMOTE_ADDR')}"
        )

        user_exists = False
        try:
            user = CustomUser.objects.get(email=email)
            user_exists = True
            logger.info(f"User found: {user.email} - Checking verification status")
        except CustomUser.DoesNotExist:
            logger.info(f"User not found: {email} - Not sending email")

        # Only send email if user exists and is unverified
        if user_exists:
            # Check if user is already verified
            if user.is_email_verified:
                logger.info(f"User {user.email} is already verified")
                return Response(
                    {"message": "Email is already verified"},
                    status=status.HTTP_200_OK,
                )

            # Invalidate ALL existing verification tokens for this user (both used and unused)
            old_tokens_count = EmailVerificationToken.invalidate_all_user_tokens(user)

            if old_tokens_count > 0:
                logger.info(
                    f"Invalidated {old_tokens_count} existing verification tokens for user: {user.email}"
                )

            # Create new verification token with security context
            verification_token = EmailVerificationToken.objects.create(
                user=user,
                ip_address=request.META.get("REMOTE_ADDR"),
                user_agent=request.META.get("HTTP_USER_AGENT", "")[
                    :500
                ],  # Limit length
            )

            logger.info(
                f"Created new verification token for user: {user.email} (token: {verification_token.token[:8]}...)"
            )

            # Send verification email with HTML template
            # Use URL_BASE configuration for consistent URL generation
            url_base = getattr(settings, "URL_BASE", "https://localhost")

            # Extract base domain and construct frontend URL
            if url_base.startswith("https://"):
                base_domain = url_base.replace("https://", "")
                frontend_url = f"http://{base_domain}:3000"
            elif url_base.startswith("http://"):
                base_domain = url_base.replace("http://", "")
                frontend_url = f"http://{base_domain}:3000"
            else:
                # Fallback to localhost if URL_BASE doesn't have protocol
                frontend_url = "http://localhost:3000"

            verification_url = (
                f"{frontend_url}/verify-email?token={verification_token.token}"
            )

            try:
                # Centralized SMTP utility handles connection reuse and templating
                send_email_verification_email(
                    to_email=user.email,
                    user_name=user.name,
                    verification_url=verification_url,
                )
                # Set email_sent_at timestamp after successfully sending the email
                # This ensures cooldown starts when email is sent, not when button is pressed
                verification_token.email_sent_at = timezone.now()
                verification_token.save(update_fields=["email_sent_at"])
                logger.info(f"Email verification email sent to: {email}")
            except Exception as e:
                logger.error(
                    f"Failed to send email verification email to {email}: {str(e)}"
                )
                # Still return success to prevent information leakage
                # Note: email_sent_at is not set if email fails to send, so cooldown won't apply

        # Always return success message regardless of whether user exists
        return Response(
            {
                "message": "If the email exists and is unverified, a verification email has been sent",
                "cooldown_total": cooldown_seconds,
                "next_request_allowed_in": cooldown_seconds,
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        logger.error(f"Resend verification email error: {str(e)}")
        return Response(
            {"error": "An error occurred while processing your request"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([AllowAny])
def debug_email(request):
    """Debug endpoint to test email handling"""
    try:
        email = request.data.get("email", "").strip().lower()
        logger.info(f"DEBUG ENDPOINT: Received email: '{email}' (length: {len(email)})")

        # Try to find user
        try:
            user = CustomUser.objects.get(email=email)
            logger.info(
                f"DEBUG ENDPOINT: Found user with email: '{user.email}' (length: {len(user.email) if user.email else 0})"
            )
            return Response(
                {
                    "received_email": email,
                    "received_length": len(email),
                    "user_email": user.email,
                    "user_email_length": len(user.email) if user.email else 0,
                    "match": email == user.email,
                }
            )
        except CustomUser.DoesNotExist:
            logger.info(f"DEBUG ENDPOINT: No user found with email: '{email}'")
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
        logger.error(f"DEBUG ENDPOINT ERROR: {str(e)}")
        return Response({"error": str(e)}, status=500)


@api_view(["GET"])
@permission_classes([AllowAny])
def check_verification_status(request):
    """Check if user's email is verified"""
    try:
        token = request.GET.get("token")

        if not token:
            return Response(
                {"error": "Token is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Find the verification token
        try:
            verification_token = EmailVerificationToken.objects.get(token=token)
        except EmailVerificationToken.DoesNotExist:
            return Response(
                {"error": "Invalid verification token"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if token is valid
        if not verification_token.is_valid():
            return Response(
                {"error": "Verification token has expired or has already been used"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = verification_token.user

        return Response(
            {
                "valid": True,
                "user": {"id": user.id, "name": user.name, "email": user.email},
                "is_verified": user.is_email_verified,
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        logger.error(f"Check verification status error: {str(e)}")
        return Response(
            {"error": "An error occurred while checking verification status"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
