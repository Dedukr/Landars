"""Shared street-address validation (delivery + billing)."""

from __future__ import annotations

import re

UK_POSTCODE_RE = re.compile(
    r"^[A-Z]{1,2}[0-9]{1,2}[A-Z]?[0-9][A-Z]{2}$",
    re.IGNORECASE,
)


def normalize_postal_code(postal_code: str | None) -> str:
    return (postal_code or "").replace(" ", "").strip().upper()


def is_valid_uk_postal_code(postal_code: str | None) -> bool:
    normalized = normalize_postal_code(postal_code)
    if not normalized:
        return False
    return bool(UK_POSTCODE_RE.match(normalized))


def validate_street_address(
    *,
    address_line: str | None,
    city: str | None,
    postal_code: str | None,
    address_line2: str | None = None,
    require_line2: bool = False,
    check_uk_postcode: bool = True,
    require_complete: bool = True,
) -> dict[str, str]:
    """
    Validate street address fields using the same rules as checkout delivery.

    When ``require_complete`` is False (profile/account save), empty fields are
    allowed; only non-empty values are checked (Latin script, UK postcode format).

    Returns a dict of field_name -> error message (empty if valid).
    """
    from account.latin_validation import LATIN_SCRIPT_ERROR, is_latin_script_text

    errors: dict[str, str] = {}
    line = (address_line or "").strip()
    line2 = (address_line2 or "").strip()
    city_val = (city or "").strip()
    postal = (postal_code or "").strip()

    if require_complete:
        if not line:
            errors["address_line"] = "Address line 1 is required"
        if require_line2 and not line2:
            errors["address_line2"] = "Address line 2 is required"
        if not city_val:
            errors["city"] = "City is required"
        if not postal:
            errors["postal_code"] = "Postal code is required"
        elif check_uk_postcode and not is_valid_uk_postal_code(postal):
            errors["postal_code"] = "Please enter a valid UK postal code"
    elif postal and check_uk_postcode and not is_valid_uk_postal_code(postal):
        errors["postal_code"] = "Please enter a valid UK postal code"

    for key, value in (
        ("address_line", line),
        ("address_line2", line2),
        ("city", city_val),
        ("postal_code", postal),
    ):
        if key in errors or not value:
            continue
        if not is_latin_script_text(value):
            errors[key] = LATIN_SCRIPT_ERROR

    return errors


PROFILE_DELIVERY_ADDRESS_REQUIRED_MESSAGE = (
    "This customer has no complete delivery address on their profile. "
    "Add address line, city, and a valid UK postal code on the user page "
    "before placing an order."
)


def profile_delivery_address_errors(profile) -> dict[str, str]:
    """
    Validate the delivery address saved on a user profile.

    Used when placing admin orders (orders use the profile address when the
    order has no address of its own).
    """
    address = getattr(profile, "address", None) if profile is not None else None
    return validate_street_address(
        address_line=getattr(address, "address_line", None),
        address_line2=getattr(address, "address_line2", None),
        city=getattr(address, "city", None),
        postal_code=getattr(address, "postal_code", None),
        require_line2=False,
        require_complete=True,
    )
