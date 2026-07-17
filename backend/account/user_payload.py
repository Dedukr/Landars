from django.conf import settings

from .models import CustomUser


def user_can_use_festival(user: CustomUser) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if not getattr(settings, "FESTIVAL_ENABLED", False):
        return False
    if not user.is_staff:
        return False
    return user.is_superuser or user.has_perm("festival.place_festival_order")


def user_payload(user: CustomUser, *, include_staff: bool = False) -> dict:
    """JSON-safe user fields for API responses."""
    data = {
        "id": user.id,
        "name": user.get_display_name(),
        "first_name": user.first_name,
        "surname": user.surname,
        "email": user.email,
    }
    if include_staff:
        data["is_staff"] = user.is_staff
        data["can_use_festival"] = user_can_use_festival(user)
    return data
