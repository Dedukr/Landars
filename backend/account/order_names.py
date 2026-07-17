"""Ensure a customer has first name and surname before placing a frontend order."""

from rest_framework import status
from rest_framework.response import Response

from .latin_validation import LATIN_SCRIPT_ERROR, is_latin_script_text


def require_customer_names(
    user, first_name_from_request=None, surname_from_request=None
) -> Response | None:
    """
    Persist name fields from the request when provided, then verify the user has
    both first name and surname. Returns a 400 Response on failure, else None.
    """
    update_fields: list[str] = []

    if first_name_from_request is not None:
        first_name = str(first_name_from_request).strip()
        if not first_name:
            return Response(
                {"error": "First name is required to place an order"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not is_latin_script_text(first_name):
            return Response(
                {"error": f"First name: {LATIN_SCRIPT_ERROR}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.first_name = first_name
        update_fields.append("first_name")

    if surname_from_request is not None:
        surname = str(surname_from_request).strip()
        if not surname:
            return Response(
                {"error": "Surname is required to place an order"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not is_latin_script_text(surname):
            return Response(
                {"error": f"Surname: {LATIN_SCRIPT_ERROR}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.surname = surname
        update_fields.append("surname")

    if update_fields:
        user.sync_computed_name()
        update_fields.append("name")
        user.save(update_fields=update_fields)

    if not (user.first_name or "").strip():
        return Response(
            {"error": "First name is required to place an order"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not (user.surname or "").strip():
        return Response(
            {"error": "Surname is required to place an order"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not is_latin_script_text(user.first_name):
        return Response(
            {"error": f"First name: {LATIN_SCRIPT_ERROR}"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not is_latin_script_text(user.surname):
        return Response(
            {"error": f"Surname: {LATIN_SCRIPT_ERROR}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return None
