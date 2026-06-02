"""
User merge service.

Automatically merges a newly-created CustomUser with an existing user whose
name is identical (after normalisation) or very similar.

Merge rules summary
-------------------
* Prefer the user that *has* an e-mail as the canonical (main) record.
* If both have the *same* e-mail, the older user (lower PK) is main.
* If both have *different* e-mails, skip the merge and log.
* If neither has an e-mail, the older user is main.
* Empty fields on main are filled from the duplicate.
* Conflicting fields stay with main (exception: phones are concatenated).
* Related objects are reassigned from duplicate → main where safe.
* The duplicate user is deactivated (is_active=False) after the merge.
"""

import logging
from difflib import SequenceMatcher

from django.db import transaction

logger = logging.getLogger(__name__)

# Fuzzy-match threshold — ratios below this will NOT trigger a merge.
SIMILARITY_THRESHOLD = 0.92


# ---------------------------------------------------------------------------
# Name helpers
# ---------------------------------------------------------------------------


def normalize_name(name: str) -> str:
    """Lowercase, strip leading/trailing space, collapse inner whitespace."""
    if not name:
        return ""
    return " ".join(name.lower().split())


def name_similarity(name1: str, name2: str) -> float:
    """Return a SequenceMatcher ratio for two names (after normalisation)."""
    n1 = normalize_name(name1)
    n2 = normalize_name(name2)
    if not n1 or not n2:
        return 0.0
    return SequenceMatcher(None, n1, n2).ratio()


def names_are_similar(name1: str, name2: str) -> bool:
    """Return True if the two names are similar enough to consider a merge."""
    n1 = normalize_name(name1)
    n2 = normalize_name(name2)
    if n1 == n2:
        return True
    return SequenceMatcher(None, n1, n2).ratio() >= SIMILARITY_THRESHOLD


# ---------------------------------------------------------------------------
# Candidate discovery
# ---------------------------------------------------------------------------


def find_similar_users(new_user):
    """Return existing users (excluding *new_user*) whose name is similar."""
    from .models import CustomUser

    similar = []
    for candidate in CustomUser.objects.exclude(pk=new_user.pk).iterator():
        if names_are_similar(new_user.name, candidate.name):
            similar.append(candidate)
    return similar


# ---------------------------------------------------------------------------
# Canonical-user selection
# ---------------------------------------------------------------------------


def select_canonical_user(user_a, user_b):
    """
    Decide which of two users is the canonical (main) record.

    Returns ``(main_user, duplicate_user)`` or ``(None, None)`` when the
    merge should be skipped.
    """
    a_has_email = bool(user_a.email)
    b_has_email = bool(user_b.email)

    if a_has_email and b_has_email:
        if user_a.email == user_b.email:
            # Same e-mail: older user (lower PK) is main.
            if (user_a.pk or float("inf")) <= (user_b.pk or float("inf")):
                return user_a, user_b
            return user_b, user_a
        else:
            # Different e-mails: do not merge.
            return None, None

    if a_has_email:
        return user_a, user_b
    if b_has_email:
        return user_b, user_a

    # Neither has an e-mail: older user (lower PK) is main.
    if (user_a.pk or float("inf")) <= (user_b.pk or float("inf")):
        return user_a, user_b
    return user_b, user_a


# ---------------------------------------------------------------------------
# Phone merging
# ---------------------------------------------------------------------------


def merge_phones(phone_main: str, phone_dup: str) -> str:
    """
    Combine two phone strings (each may be comma-separated lists) into a
    single comma-separated string, deduplicating identical numbers.
    """
    phones_main = [p.strip() for p in (phone_main or "").split(",") if p.strip()]
    phones_dup = [p.strip() for p in (phone_dup or "").split(",") if p.strip()]

    merged = list(phones_main)
    for phone in phones_dup:
        if phone not in merged:
            merged.append(phone)
    return ", ".join(merged)


# ---------------------------------------------------------------------------
# Address merging
# ---------------------------------------------------------------------------


def _merge_address_objects(main_address, dup_address, main_user_pk, dup_user_pk):
    """
    Fill empty fields on *main_address* from *dup_address*.
    If both have values for a field they differ, keep main's value and log.
    """
    fields_to_check = ["address_line", "address_line2", "city", "postal_code"]
    update_fields = []

    for field in fields_to_check:
        main_val = getattr(main_address, field, None)
        dup_val = getattr(dup_address, field, None)

        if not main_val and dup_val:
            setattr(main_address, field, dup_val)
            update_fields.append(field)
            logger.info(
                "Merge: filled address field '%s' from dup user %s for main user %s",
                field,
                dup_user_pk,
                main_user_pk,
            )
        elif main_val and dup_val and main_val != dup_val:
            logger.info(
                "Merge: address field '%s' conflict — kept main user %s value, skipped dup user %s value",
                field,
                main_user_pk,
                dup_user_pk,
            )

    if update_fields:
        main_address.save(update_fields=update_fields)


def _merge_profiles(main_user, dup_user):
    """Merge profile (phone, notes, address) from *dup_user* into *main_user*."""
    from .models import Address, Profile

    main_profile = getattr(main_user, "profile", None)
    dup_profile = getattr(dup_user, "profile", None)

    if not dup_profile:
        logger.info(
            "Merge: dup user %s has no profile — nothing to merge from profile.",
            dup_user.pk,
        )
        return

    if not main_profile:
        # Re-attach dup_profile to main_user (O2O reassignment).
        logger.info(
            "Merge: main user %s has no profile — reassigning dup user %s profile.",
            main_user.pk,
            dup_user.pk,
        )
        Profile.objects.filter(pk=dup_profile.pk).update(user=main_user)
        return

    # ── Both have profiles: merge field by field ──────────────────────────
    profile_update_fields = []

    # Phone
    if main_profile.phone and dup_profile.phone:
        merged_phone = merge_phones(main_profile.phone, dup_profile.phone)
        if merged_phone != main_profile.phone:
            logger.info(
                "Merge: merging phones '%s' + '%s' → '%s' for main user %s",
                main_profile.phone,
                dup_profile.phone,
                merged_phone,
                main_user.pk,
            )
            main_profile.phone = merged_phone
            profile_update_fields.append("phone")
    elif not main_profile.phone and dup_profile.phone:
        logger.info(
            "Merge: copied phone '%s' from dup user %s to main user %s",
            dup_profile.phone,
            dup_user.pk,
            main_user.pk,
        )
        main_profile.phone = dup_profile.phone
        profile_update_fields.append("phone")

    # Notes
    if not main_profile.notes and dup_profile.notes:
        logger.info(
            "Merge: copied notes from dup user %s to main user %s",
            dup_user.pk,
            main_user.pk,
        )
        main_profile.notes = dup_profile.notes
        profile_update_fields.append("notes")
    elif main_profile.notes and dup_profile.notes and main_profile.notes != dup_profile.notes:
        logger.info(
            "Merge: notes conflict — kept main user %s notes, skipped dup user %s notes",
            main_user.pk,
            dup_user.pk,
        )

    # Address
    main_address = main_profile.address
    dup_address = dup_profile.address

    if dup_address and not main_address:
        logger.info(
            "Merge: main user %s has no address — creating copy from dup user %s",
            main_user.pk,
            dup_user.pk,
        )
        new_address = Address.objects.create(
            address_line=dup_address.address_line,
            address_line2=dup_address.address_line2,
            city=dup_address.city,
            postal_code=dup_address.postal_code,
        )
        main_profile.address = new_address
        profile_update_fields.append("address")
    elif dup_address and main_address:
        _merge_address_objects(main_address, dup_address, main_user.pk, dup_user.pk)

    if profile_update_fields:
        main_profile.save(update_fields=profile_update_fields)


# ---------------------------------------------------------------------------
# User-level field merging
# ---------------------------------------------------------------------------


def _merge_user_fields(main_user, dup_user):
    """
    Copy safe simple fields from *dup_user* to *main_user* when main is empty.
    Returns the list of fields that were updated (for queryset .update()).
    """
    updates = {}

    if not main_user.is_email_verified and dup_user.is_email_verified:
        updates["is_email_verified"] = True
        logger.info(
            "Merge: copied is_email_verified=True from dup user %s to main user %s",
            dup_user.pk,
            main_user.pk,
        )

    if updates:
        from .models import CustomUser

        CustomUser.objects.filter(pk=main_user.pk).update(**updates)

    return updates


# ---------------------------------------------------------------------------
# Related-object reassignment helpers
# ---------------------------------------------------------------------------


def _reassign_generic_fk(model, field_name, main_user, dup_user, description):
    """Bulk-update a FK column from *dup_user* → *main_user*."""
    count = model.objects.filter(**{field_name: dup_user}).update(
        **{field_name: main_user}
    )
    if count:
        logger.info(
            "Merge: reassigned %d %s from dup user %s to main user %s",
            count,
            description,
            dup_user.pk,
            main_user.pk,
        )


def _reassign_orders(main_user, dup_user):
    try:
        from api.models import Order

        count = Order.objects.filter(customer=dup_user).update(customer=main_user)
        if count:
            logger.info(
                "Merge: reassigned %d orders from dup user %s to main user %s",
                count,
                dup_user.pk,
                main_user.pk,
            )
    except Exception as exc:
        logger.warning(
            "Merge: could not reassign orders — dup %s → main %s: %s",
            dup_user.pk,
            main_user.pk,
            exc,
        )


def _reassign_product_reviews(main_user, dup_user):
    try:
        from api.models import ProductReview

        count = ProductReview.objects.filter(user=dup_user).update(user=main_user)
        if count:
            logger.info(
                "Merge: reassigned %d product reviews from dup user %s to main user %s",
                count,
                dup_user.pk,
                main_user.pk,
            )
    except Exception as exc:
        logger.warning(
            "Merge: could not reassign product reviews: %s",
            exc,
        )


def _reassign_cart(main_user, dup_user):
    """
    Move *dup_user*'s cart items to *main_user*'s cart.
    Items whose product already exists in the main cart are skipped.
    The dup cart is deleted afterwards.
    """
    try:
        from api.models import Cart, CartItem

        dup_cart = Cart.objects.filter(user=dup_user).first()
        if not dup_cart:
            return

        main_cart, _ = Cart.objects.get_or_create(user=main_user)

        for item in CartItem.objects.filter(cart=dup_cart):
            if CartItem.objects.filter(cart=main_cart, product=item.product).exists():
                logger.info(
                    "Merge: cart item for product %s already in main cart — skipped",
                    item.product_id,
                )
            else:
                CartItem.objects.filter(pk=item.pk).update(cart=main_cart)
                logger.info(
                    "Merge: moved cart item product %s → main cart",
                    item.product_id,
                )

        dup_cart.delete()
        logger.info(
            "Merge: deleted dup user %s cart after moving items to main user %s",
            dup_user.pk,
            main_user.pk,
        )
    except Exception as exc:
        logger.warning(
            "Merge: could not merge carts — dup %s → main %s: %s",
            dup_user.pk,
            main_user.pk,
            exc,
        )


def _reassign_wishlist(main_user, dup_user):
    """
    Move *dup_user*'s wishlist items to *main_user*'s wishlist.
    Duplicate products are skipped.  The dup wishlist is deleted afterwards.
    """
    try:
        from api.models import Wishlist, WishlistItem

        dup_wishlist = Wishlist.objects.filter(user=dup_user).first()
        if not dup_wishlist:
            return

        main_wishlist, _ = Wishlist.objects.get_or_create(user=main_user)

        for item in WishlistItem.objects.filter(wishlist=dup_wishlist):
            if WishlistItem.objects.filter(
                wishlist=main_wishlist, product=item.product
            ).exists():
                logger.info(
                    "Merge: wishlist item for product %s already in main wishlist — skipped",
                    item.product_id,
                )
            else:
                WishlistItem.objects.filter(pk=item.pk).update(wishlist=main_wishlist)
                logger.info(
                    "Merge: moved wishlist item product %s → main wishlist",
                    item.product_id,
                )

        dup_wishlist.delete()
        logger.info(
            "Merge: deleted dup user %s wishlist after moving items to main user %s",
            dup_user.pk,
            main_user.pk,
        )
    except Exception as exc:
        logger.warning(
            "Merge: could not merge wishlists: %s",
            exc,
        )


def _reassign_reconciliation(main_user, dup_user):
    try:
        from reconciliation.models import BankTransaction, StatementBatch

        count = StatementBatch.objects.filter(uploaded_by=dup_user).update(
            uploaded_by=main_user
        )
        if count:
            logger.info(
                "Merge: reassigned %d statement batches → main user %s",
                count,
                main_user.pk,
            )

        count = BankTransaction.objects.filter(matched_by=dup_user).update(
            matched_by=main_user
        )
        if count:
            logger.info(
                "Merge: reassigned %d bank transactions → main user %s",
                count,
                main_user.pk,
            )
    except Exception as exc:
        logger.warning(
            "Merge: could not reassign reconciliation objects: %s",
            exc,
        )


def _reassign_all_related(main_user, dup_user):
    """Reassign every FK/O2O that points to *dup_user* over to *main_user*."""
    from .models import EmailVerificationToken, PasswordResetToken, PaymentInformation

    _reassign_generic_fk(
        PaymentInformation, "user", main_user, dup_user, "payment methods"
    )
    _reassign_generic_fk(
        PasswordResetToken, "user", main_user, dup_user, "password reset tokens"
    )
    _reassign_generic_fk(
        EmailVerificationToken,
        "user",
        main_user,
        dup_user,
        "email verification tokens",
    )
    _reassign_orders(main_user, dup_user)
    _reassign_product_reviews(main_user, dup_user)
    _reassign_cart(main_user, dup_user)
    _reassign_wishlist(main_user, dup_user)
    _reassign_reconciliation(main_user, dup_user)


# ---------------------------------------------------------------------------
# Deactivation
# ---------------------------------------------------------------------------


def _deactivate_duplicate(dup_user):
    """Set *dup_user* inactive using a queryset update (bypasses full_clean)."""
    from .models import CustomUser

    CustomUser.objects.filter(pk=dup_user.pk).update(is_active=False)
    logger.info(
        "Merge: deactivated duplicate user '%s' (pk=%s) after merge",
        dup_user.name,
        dup_user.pk,
    )


# ---------------------------------------------------------------------------
# Single-pair merge
# ---------------------------------------------------------------------------


def _attempt_merge(new_user, candidate):
    """Try to merge *new_user* with a single *candidate* duplicate."""
    ratio = name_similarity(new_user.name, candidate.name)
    logger.info(
        "Merge: possible duplicate — new user '%s' (pk=%s) vs existing '%s' (pk=%s), "
        "similarity=%.3f",
        new_user.name,
        new_user.pk,
        candidate.name,
        candidate.pk,
        ratio,
    )

    main_user, dup_user = select_canonical_user(new_user, candidate)

    if main_user is None:
        logger.info(
            "Merge: skipped — users '%s' (pk=%s) and '%s' (pk=%s) have different "
            "e-mails (%s vs %s)",
            new_user.name,
            new_user.pk,
            candidate.name,
            candidate.pk,
            new_user.email,
            candidate.email,
        )
        return

    logger.info(
        "Merge: canonical user → '%s' (pk=%s), duplicate → '%s' (pk=%s)",
        main_user.name,
        main_user.pk,
        dup_user.name,
        dup_user.pk,
    )

    with transaction.atomic():
        _merge_user_fields(main_user, dup_user)
        _merge_profiles(main_user, dup_user)
        _reassign_all_related(main_user, dup_user)
        _deactivate_duplicate(dup_user)

    logger.info(
        "Merge: completed — '%s' (pk=%s) merged into '%s' (pk=%s)",
        dup_user.name,
        dup_user.pk,
        main_user.name,
        main_user.pk,
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def merge_users(new_user):
    """
    Find existing users whose name is similar to *new_user* and merge them.

    This is the function called by the post_save signal.  It is kept separate
    so that it can also be invoked from management commands or tests.
    """
    similar_users = find_similar_users(new_user)

    if not similar_users:
        logger.debug(
            "Merge: no similar users found for new user '%s' (pk=%s)",
            new_user.name,
            new_user.pk,
        )
        return

    for candidate in similar_users:
        _attempt_merge(new_user, candidate)
