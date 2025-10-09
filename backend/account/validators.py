"""
Custom password validators for the FoodPlatform application.
"""

import re

from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _


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
