from django.urls import path
from rest_framework.authtoken.views import obtain_auth_token
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

urlpatterns = [
    # Authentication
    path("register/", views.register, name="register"),
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    # JWT Token Management
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    # User Management
    path("user/", views.user_profile, name="user_profile"),  # Alias for profile
    path("profile/", views.user_profile, name="user_profile"),
    path("change-password/", views.change_password, name="change_password"),
    path("password-reset/", views.request_password_reset, name="password_reset"),
    # Legacy endpoints
    path("token/", obtain_auth_token, name="obtain_auth_token"),
    path("csrf-token/", views.csrf_token, name="csrf_token"),
]
