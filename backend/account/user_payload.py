from django.conf import settings

from .models import Address, BillingAddress, CustomUser, Profile


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


def address_payload(address: Address | None) -> dict | None:
    if not address:
        return None
    return {
        "address_line": address.address_line or "",
        "address_line2": address.address_line2 or "",
        "city": address.city or "",
        "postal_code": address.postal_code or "",
    }


def billing_address_flat(billing: BillingAddress | None) -> dict:
    """Flat bill_* fields for frontend forms (from BillingAddress)."""
    if billing:
        return {
            "bill_company_name": billing.company_name or "",
            "bill_contact_name": billing.contact_name or "",
            "bill_address_line": billing.address_line or "",
            "bill_address_line2": billing.address_line2 or "",
            "bill_city": billing.city or "",
            "bill_postal_code": billing.postal_code or "",
        }
    return {
        "bill_company_name": "",
        "bill_contact_name": "",
        "bill_address_line": "",
        "bill_address_line2": "",
        "bill_city": "",
        "bill_postal_code": "",
    }


def profile_payload(profile: Profile | None) -> dict | None:
    if not profile:
        return None
    return {
        "phone": profile.phone or "",
        "notes": profile.notes or "",
        "bill_use_delivery_address": profile.bill_use_delivery_address,
        **billing_address_flat(profile.billing_address),
        "billing_address": profile.billing_address_fields(),
    }


def user_profile_payload(user: CustomUser) -> dict:
    profile = getattr(user, "profile", None)
    return {
        "user": {
            **user_payload(user, include_staff=True),
            "last_login": user.last_login,
        },
        "profile": profile_payload(profile),
        "address": address_payload(profile.address if profile else None),
    }
