from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import views

urlpatterns = [
    # Authentication
    path("register/", views.register, name="register"),
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    # JWT Token Management
    path("token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    # User Management
    path("user/", views.user_profile, name="user_profile"),  # Alias for profile
    path("profile/", views.user_profile, name="user_profile"),
    path("profile/update/", views.update_profile, name="update_profile"),
    path("change-password/", views.change_password, name="change_password"),
    path("password-reset/", views.request_password_reset, name="password_reset"),
    path(
        "password-reset/validate/",
        views.validate_password_reset_token,
        name="validate_password_reset_token",
    ),
    path(
        "password-reset/confirm/",
        views.confirm_password_reset,
        name="confirm_password_reset",
    ),
    # Email Verification
    path("verify-email/", views.verify_email, name="verify_email"),
    path(
        "resend-verification/",
        views.resend_verification_email,
        name="resend_verification_email",
    ),
    path(
        "check-verification/",
        views.check_verification_status,
        name="check_verification_status",
    ),
    # Payment Methods
    path("payment-methods/", views.payment_methods, name="payment_methods"),
    path(
        "payment-methods/<int:payment_id>/",
        views.payment_method_detail,
        name="payment_method_detail",
    ),
    path(
        "payment-methods/<int:payment_id>/set-default/",
        views.set_default_payment_method,
        name="set_default_payment_method",
    ),
    # CSRF Token
    path("csrf-token/", views.csrf_token, name="csrf_token"),
    # Debug
    path("debug-email/", views.debug_email, name="debug_email"),
]
