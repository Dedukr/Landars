"""Helpers for creating / updating BillingAddress rows."""

from __future__ import annotations

from typing import Any

from account.address_validation import validate_street_address
from account.models import BillingAddress, CustomUser, Profile


def _clean(value: Any) -> str | None:
    text = (value or "").strip() if value is not None else ""
    return text or None


def billing_payload_from_request(data: dict) -> dict[str, str | None]:
    """
    Normalize billing fields from API/form payloads.

    Accepts either nested ``billing_address`` or flat ``bill_*`` / plain keys.
    """
    nested = data.get("billing_address")
    if not isinstance(nested, dict):
        nested = {}

    def pick(*keys: str) -> str | None:
        for key in keys:
            if key in nested and nested.get(key) is not None:
                return _clean(nested.get(key))
            if key in data and data.get(key) is not None:
                return _clean(data.get(key))
        return None

    return {
        "company_name": pick("company_name", "bill_company_name"),
        "contact_name": pick("contact_name", "bill_contact_name"),
        "address_line": pick("address_line", "bill_address_line"),
        "address_line2": pick("address_line2", "bill_address_line2"),
        "city": pick("city", "bill_city"),
        "postal_code": pick("postal_code", "bill_postal_code"),
    }


def validate_billing_street(fields: dict[str, str | None]) -> dict[str, str]:
    """Same rules as delivery address (line2 optional, UK postcode)."""
    errors = validate_street_address(
        address_line=fields.get("address_line"),
        address_line2=fields.get("address_line2"),
        city=fields.get("city"),
        postal_code=fields.get("postal_code"),
        require_line2=False,
    )
    # Map to bill_* keys for API/form compatibility.
    return {f"bill_{key}" if not key.startswith("bill_") else key: msg for key, msg in errors.items()}


def upsert_profile_billing_address(
    profile: Profile,
    fields: dict[str, str | None],
) -> BillingAddress:
    """Create or update the customer's saved billing address on the profile."""
    billing = profile.billing_address
    if billing is None:
        billing = BillingAddress(customer=profile.user)
    else:
        billing.customer = profile.user

    billing.company_name = fields.get("company_name")
    billing.contact_name = fields.get("contact_name")
    billing.address_line = fields.get("address_line")
    billing.address_line2 = fields.get("address_line2")
    billing.city = fields.get("city")
    billing.postal_code = fields.get("postal_code")
    billing.save()

    profile.billing_address = billing
    return billing


def create_order_billing_address(
    customer: CustomUser,
    fields: dict[str, str | None],
) -> BillingAddress:
    """Create a new BillingAddress snapshot for an order (does not mutate profile)."""
    return BillingAddress.objects.create(
        customer=customer,
        company_name=fields.get("company_name"),
        contact_name=fields.get("contact_name"),
        address_line=fields.get("address_line"),
        address_line2=fields.get("address_line2"),
        city=fields.get("city"),
        postal_code=fields.get("postal_code"),
    )
