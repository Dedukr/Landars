from .models import CustomUser


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
    return data
