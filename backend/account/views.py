import logging

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.middleware.csrf import get_token
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .models import CustomUser

# Configure logger for security events
logger = logging.getLogger("account")


# Custom throttle for registration
class RegisterThrottle(AnonRateThrottle):
    rate = "3/hour"


# Custom throttle for login
class LoginThrottle(AnonRateThrottle):
    rate = "5/minute"


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

        # Email format validation
        if "@" not in email or "." not in email.split("@")[-1]:
            return Response(
                {"error": "Please provide a valid email address"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate password strength using Django's validators
        try:
            validate_password(password)
        except ValidationError as e:
            return Response(
                {"error": list(e.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if user already exists
        if CustomUser.objects.filter(email=email).exists():
            logger.warning(
                f"Registration attempt with existing email: {email} from IP: {request.META.get('REMOTE_ADDR')}"
            )
            return Response(
                {"error": "User with this email already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if CustomUser.objects.filter(name=name).exists():
            return Response(
                {"error": "User with this name already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create new user
        user = CustomUser.objects.create_user(name=name, email=email, password=password)

        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)

        # Log successful registration
        logger.info(
            f"New user registered: {email} from IP: {request.META.get('REMOTE_ADDR')}"
        )

        return Response(
            {
                "message": "User created successfully",
                "access": str(refresh.access_token),
                "refresh": str(refresh),
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

        # Authenticate user (this will be checked by django-axes for lockout)
        user = authenticate(request, username=email, password=password)

        if user is None:
            logger.warning(
                f"Failed login attempt for email: {email} from IP: {request.META.get('REMOTE_ADDR')}"
            )
            return Response(
                {"error": "Invalid email or password"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not user.is_active:
            logger.warning(
                f"Login attempt for inactive user: {email} from IP: {request.META.get('REMOTE_ADDR')}"
            )
            return Response(
                {"error": "Account is inactive"}, status=status.HTTP_401_UNAUTHORIZED
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
                "user": {"id": user.id, "name": user.name, "email": user.email},
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
        return Response(
            {
                "user": {
                    "id": request.user.id,
                    "name": request.user.name,
                    "email": request.user.email,
                    "last_login": request.user.last_login,
                }
            },
            status=status.HTTP_200_OK,
        )
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


@api_view(["POST"])
@permission_classes([AllowAny])
def request_password_reset(request):
    """Request password reset - sends reset email"""
    email = request.data.get("email", "").strip().lower()

    if not email:
        return Response(
            {"error": "Email is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Always return success to prevent email enumeration
    # In production, implement actual email sending
    logger.info(
        f"Password reset requested for email: {email} from IP: {request.META.get('REMOTE_ADDR')}"
    )

    return Response(
        {"message": "If the email exists, a password reset link has been sent"},
        status=status.HTTP_200_OK,
    )


@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
def csrf_token(request):
    """Get CSRF token for frontend"""
    return Response({"csrfToken": get_token(request)})
