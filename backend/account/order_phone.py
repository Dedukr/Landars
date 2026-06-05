"""Ensure a customer has a valid phone before placing a frontend order."""

from rest_framework import status
from rest_framework.response import Response

from .models import Profile
from .phone_utils import is_valid_phone, normalize_phone


def require_customer_phone(user, phone_from_request=None) -> Response | None:
    """
    Persist ``phone_from_request`` on the user's profile when valid, then verify
    the profile has a usable phone. Returns a 400 Response on failure, else None.
    """
    profile, _ = Profile.objects.get_or_create(user=user)

    if phone_from_request is not None:
        candidate = normalize_phone(str(phone_from_request))
        if candidate:
            if not is_valid_phone(candidate):
                return Response(
                    {"error": "Please provide a valid phone number"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            profile.phone = candidate
            profile.save(update_fields=["phone"])

    if not is_valid_phone(profile.phone):
        return Response(
            {"error": "Phone number is required to place an order"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return None
