"""
Custom password validators for the FoodPlatform application.
"""

import re

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _

User = get_user_model()


class CustomPasswordValidator:
    """
    Custom password validator with the following requirements:
    - Minimum 8 characters
    - Must contain at least one letter and one number
    - No personal information checking (simplified requirements)
    """

    def __init__(self, min_length=8):
        self.min_length = min_length

    def validate(self, password, user=None):
        if len(password) < self.min_length:
            raise ValidationError(
                _("This password must contain at least %(min_length)d characters."),
                code="password_too_short",
                params={"min_length": self.min_length},
            )

        # Check for at least one letter
        if not re.search(r"[a-zA-Z]", password):
            raise ValidationError(
                _("This password must contain at least one letter."),
                code="password_no_letters",
            )

        # Check for at least one number
        if not re.search(r"[0-9]", password):
            raise ValidationError(
                _("This password must contain at least one number."),
                code="password_no_numbers",
            )

    def get_help_text(self):
        return _(
            "Your password must be at least %(min_length)d characters long "
            "and contain at least one letter and one number."
        ) % {"min_length": self.min_length}


def validate_unique_email(email, exclude_user_id=None):
    """
    Validator to ensure email uniqueness (case-insensitive).

    Note: Email should already be normalized before calling this validator.

    Args:
        email: The email address to validate (should be normalized)
        exclude_user_id: User ID to exclude from uniqueness check (for updates)

    Raises:
        ValidationError: If email already exists
    """
    if not email:
        return

    # Ensure email is normalized (in case it wasn't normalized before)
    normalized_email = User.objects.normalize_email(email)

    # Check for existing user with this email (case-insensitive)
    # Use exact match since emails are normalized in the database
    queryset = User.objects.filter(email=normalized_email)
    if exclude_user_id is not None:
        queryset = queryset.exclude(pk=exclude_user_id)

    if queryset.exists():
        raise ValidationError(
            "A user with this email address already exists. Please use a different email or try logging in.",
            code="email_exists",
        )
