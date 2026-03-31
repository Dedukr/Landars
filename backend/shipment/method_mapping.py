"""
LandarsFood UK post: logical shipping options → Sendcloud live method rows.

Sendcloud contract model used here: **Royal Mail Tracked 24** and **Tracked 48** each
offer, per speed:

* Small Parcel (typically up to ~2 kg)
* Medium Parcel 0–5 kg, 5–10 kg, 10–20 kg

Only **non-signed** small/medium lines are matched (no Large Letter, no Signed).

``Shipment.logical_shipping_option`` is ``uk_tracked_48`` or ``uk_tracked_24`` (see
:func:`logical_shipping_option_for_billable_kg`). ``uk_standard_small_parcel`` is
kept only for legacy DB rows; new snapshots use Tracked 48 for all weights below
``POST_SHIPMENT_TRACKED_24_MIN_KG``.

At ship time, ``pick_sendcloud_method_id`` picks the **tightest** method row whose
weight bounds contain the parcel (API fields plus ``0-5kg``-style name bands).

Edit :data:`LOGICAL_SHIPPING_MAP` when Sendcloud naming or product limits change.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

MethodRow = dict[str, Any]

# Royal Mail / Sendcloud product names often include "0–5 kg", "5-10kg", etc. When the
# API omits max_weight on a row, that tier would otherwise match every parcel weight.
_NAME_KG_BAND = re.compile(
    r"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*kg",
    re.IGNORECASE,
)
# "untracked" and "non-tracked" contain the substring "tracked"; do not treat as Tracked™.
_UNTRACKED_OK = re.compile(r"\buntracked\b|\bnon[- ]tracked\b", re.IGNORECASE)


def _lower(s: Any) -> str:
    return str(s or "").lower()


def _carrier_blob(method: MethodRow) -> str:
    c = method.get("carrier")
    parts: list[str] = []
    if isinstance(c, dict):
        parts.extend(
            [str(c.get("code") or ""), str(c.get("name") or "")]
        )
    else:
        parts.append(str(c or ""))
    return " ".join(parts).lower()


def _parse_kg(val: Any) -> float | None:
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _name_weight_band_kg(name: Any) -> tuple[float | None, float | None]:
    """Parse a ``min-max kg`` clause from the shipping method display name, if any."""
    m = _NAME_KG_BAND.search(_lower(name))
    if not m:
        return None, None
    try:
        return float(m.group(1)), float(m.group(2))
    except ValueError:
        return None, None


def method_weight_bounds_from_api(method: MethodRow) -> tuple[float | None, float | None]:
    """``min_weight`` / ``max_weight`` from the method object and nested ``properties``."""
    min_w = _parse_kg(method.get("min_weight"))
    max_w = _parse_kg(method.get("max_weight"))
    props = method.get("properties")
    if isinstance(props, dict):
        if min_w is None:
            min_w = _parse_kg(props.get("min_weight"))
        if max_w is None:
            max_w = _parse_kg(props.get("max_weight"))
    return min_w, max_w


def method_effective_weight_bounds(
    method: MethodRow,
) -> tuple[float | None, float | None]:
    """
    Combine API bounds with name-derived kg bands.

    When Sendcloud leaves ``max_weight`` empty, the product title (e.g. ``0-5kg``)
    still limits the tier so we do not pick a light band for a heavy parcel.
    """
    api_min, api_max = method_weight_bounds_from_api(method)
    name_min, name_max = _name_weight_band_kg(method.get("name"))
    eff_min = api_min if api_min is not None else name_min
    eff_max = api_max if api_max is not None else name_max
    return eff_min, eff_max


def method_row_accepts_parcel_weight(method: MethodRow, parcel_weight_kg: float) -> bool:
    min_w, max_w = method_effective_weight_bounds(method)
    eps = 1e-5
    w = float(parcel_weight_kg)
    if min_w is not None and w < min_w - eps:
        return False
    if max_w is not None and w > max_w + eps:
        return False
    return True


def _pick_rank_key(row: MethodRow) -> tuple:
    """
    Prefer the **tightest** applicable tier: smallest finite ``max``, then highest ``min``.

    Rows without an upper bound sort last so a generic "Tracked 48" does not beat a
    weight-tier product when both appear in the same API response.
    """
    min_w, max_w = method_effective_weight_bounds(row)
    has_cap = max_w is not None
    cap = max_w if max_w is not None else float("inf")
    floor = min_w if min_w is not None else 0.0
    return (0 if has_cap else 1, cap, -floor)


@dataclass(frozen=True)
class LogicalShippingSpec:
    """Match Sendcloud ``shipping_methods`` rows and cap parcel kg for this product."""

    label: str
    carrier_must_contain: str
    name_match_groups: tuple[tuple[str, ...], ...]
    name_none_of: tuple[str, ...] = ()
    parcel_max_kg: float | None = None


_TRACKED_SPEED_EXCLUDE = (
    "signed",
    "large letter",
)

LOGICAL_SHIPPING_MAP: dict[str, LogicalShippingSpec] = {
    "uk_tracked_48": LogicalShippingSpec(
        label="Royal Mail Tracked 48 (small + medium, non-signed)",
        carrier_must_contain="royal_mail",
        name_match_groups=(("tracked", "48"),),
        name_none_of=_TRACKED_SPEED_EXCLUDE,
    ),
    "uk_tracked_24": LogicalShippingSpec(
        label="Royal Mail Tracked 24 (small + medium, non-signed)",
        carrier_must_contain="royal_mail",
        name_match_groups=(("tracked", "24"),),
        name_none_of=_TRACKED_SPEED_EXCLUDE,
    ),
    "uk_standard_small_parcel": LogicalShippingSpec(
        label="Royal Mail small parcel (economy / max 2 kg)",
        carrier_must_contain="royal_mail",
        name_match_groups=(
            # Sendcloud Royal Mail v2 often has no 2nd-class product; light parcels are
            # ``Tracked 48 - Small Parcel`` (e.g. id 29632), not medium/large letter.
            ("tracked", "48", "small", "parcel"),
            ("standard", "parcel"),
            ("2nd", "class"),
            ("second", "class"),
            ("2nd", "parcel"),
        ),
        name_none_of=(
            "signed",
            "large letter",
            "medium",
            "tracked 24",
        ),
        parcel_max_kg=2.0,
    ),
}


def _name_violates_none_of(name: str, none_of: tuple[str, ...]) -> bool:
    """True if ``name`` contains a banned fragment (with a special case for ``tracked``)."""
    n = _lower(name)
    for banned in none_of:
        bl = banned.lower()
        if bl == "tracked":
            if _UNTRACKED_OK.search(n):
                continue
            if bl in n:
                return True
            continue
        if bl in n:
            return True
    return False


def _spec_matches_row(row: MethodRow, spec: LogicalShippingSpec) -> bool:
    carrier = _carrier_blob(row)
    if spec.carrier_must_contain not in carrier:
        return False
    name = str(row.get("name") or "")
    if _name_violates_none_of(name, spec.name_none_of):
        return False
    name = _lower(name)
    if not spec.name_match_groups:
        return True
    return any(
        all(frag.lower() in name for frag in group)
        for group in spec.name_match_groups
    )


def logical_shipping_option_for_billable_kg(billable_weight_kg: float) -> str:
    """
    Map billable kg (goods + packaging) to ``Shipment.logical_shipping_option``.

    * If ``POST_SHIPMENT_TRACKED_24_MIN_KG`` is set and weight is **strictly greater than**
      that value → ``uk_tracked_24`` (Small + Medium tiers for Tracked **24**).
    * Otherwise (including weight **equal** to the threshold) → ``uk_tracked_48``.

    The concrete Sendcloud product (small vs 0–5 / 5–10 / 10–20 kg medium) is resolved
    at ship time by :func:`pick_sendcloud_method_id` from parcel weight.
    """
    from django.conf import settings as django_settings

    w = max(0.0, float(billable_weight_kg))
    t24_raw = getattr(django_settings, "POST_SHIPMENT_TRACKED_24_MIN_KG", None)
    if t24_raw is not None and w > float(t24_raw):
        return "uk_tracked_24"
    return "uk_tracked_48"


def pick_sendcloud_method_id(
    methods: list[MethodRow],
    logical_key: str,
    parcel_weight_kg: float,
) -> int:
    """Resolve to a Sendcloud ``shipping_methods`` id for ``logical_key`` and parcel kg."""
    try:
        spec = LOGICAL_SHIPPING_MAP[logical_key]
    except KeyError:
        raise ValueError(f"Unknown logical shipping option: {logical_key!r}") from None

    w = float(parcel_weight_kg)
    if spec.parcel_max_kg is not None and w > spec.parcel_max_kg + 1e-5:
        raise ValueError(
            f"Parcel weight {w} kg above maximum {spec.parcel_max_kg} kg "
            f"for logical option {logical_key!r}"
        )

    candidates: list[MethodRow] = []
    for row in methods:
        mid = row.get("id")
        if mid is None:
            continue
        if not _spec_matches_row(row, spec):
            continue
        if not method_row_accepts_parcel_weight(row, w):
            continue
        candidates.append(row)

    if not candidates:
        raise ValueError(
            f"No Sendcloud shipping method matched logical option {logical_key!r} at {w} kg. "
            "Inspect GET /shipping_methods and update LOGICAL_SHIPPING_MAP if names changed."
        )

    candidates.sort(key=_pick_rank_key)
    return int(candidates[0]["id"])
