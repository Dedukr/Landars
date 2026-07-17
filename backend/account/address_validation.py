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
) -> dict[str, str]:
    """
    Validate street address fields using the same rules as checkout delivery.

    Returns a dict of field_name -> error message (empty if valid).
    """
    errors: dict[str, str] = {}
    line = (address_line or "").strip()
    line2 = (address_line2 or "").strip()
    city_val = (city or "").strip()
    postal = (postal_code or "").strip()

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

    return errors
