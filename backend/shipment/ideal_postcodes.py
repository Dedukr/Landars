"""
UK address cleanup via Ideal Postcodes Address Cleanse API.

POST https://api.ideal-postcodes.co.uk/v1/cleanse/addresses
See: https://docs.ideal-postcodes.co.uk/docs/api/address-cleanse
OpenAPI: https://openapi.ideal-postcodes.co.uk/openapi.json

Authenticates with ``Authorization: IDEALPOSTCODES api_key="…"`` (or query
``api_key``). On success (body ``code`` 2000), ``result.match`` is a PAF-style
dict with ``line_1``..``line_3``, ``post_town``, ``postcode``, etc.
"""

from __future__ import annotations

import logging
from typing import Any

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

IDEAL_POSTCODES_SUCCESS_CODE = 2000


def _api_key() -> str | None:
    raw = getattr(settings, "IDEAL_POSTCODES_API_KEY", None)
    if raw is None:
        return None
    key = str(raw).strip()
    return key or None


def _min_confidence() -> float:
    return float(getattr(settings, "IDEAL_POSTCODES_CLEANSE_MIN_CONFIDENCE", 0.72))


def _base_url() -> str:
    return (getattr(settings, "IDEAL_POSTCODES_BASE_URL", "") or "").strip().rstrip(
        "/"
    ) or "https://api.ideal-postcodes.co.uk"


def _paf_match_to_snapshot_fields(match: dict[str, Any]) -> dict[str, str]:
    line1 = (match.get("line_1") or "").strip()
    line2 = (match.get("line_2") or "").strip()
    line3 = (match.get("line_3") or "").strip()
    extras = ", ".join(x for x in (line2, line3) if x)
    return {
        "address_line": line1,
        "address_line2": extras,
        "city": (match.get("post_town") or "").strip(),
        "postal_code": (match.get("postcode") or "").strip(),
    }


def _build_cleanse_query(snap: dict[str, Any]) -> str:
    parts = [
        (snap.get("address_line") or "").strip(),
        (snap.get("address_line2") or "").strip(),
        (snap.get("city") or "").strip(),
        (snap.get("postal_code") or "").strip(),
    ]
    return ", ".join(p for p in parts if p)


def cleanse_uk_address(
    *,
    query: str,
    postcode: str | None = None,
    post_town: str | None = None,
) -> dict[str, Any] | None:
    """
    Call Address Cleanse. Returns the API JSON dict on HTTP 200, or None on
    failure / missing key.
    """
    api_key = _api_key()
    if not api_key:
        return None
    q = (query or "").strip()
    if not q and not (postcode or post_town):
        return None

    url = f"{_base_url()}/v1/cleanse/addresses"
    headers = {
        "Authorization": f'IDEALPOSTCODES api_key="{api_key}"',
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    body: dict[str, Any] = {"query": q or (postcode or post_town or "")}
    if postcode:
        body["postcode"] = postcode.strip()
    if post_town:
        body["post_town"] = post_town.strip()

    try:
        resp = requests.post(
            url,
            json=body,
            headers=headers,
            timeout=getattr(settings, "IDEAL_POSTCODES_REQUEST_TIMEOUT", 15),
        )
    except requests.RequestException as exc:
        logger.warning("Ideal Postcodes cleanse request failed: %s", exc)
        return None

    if resp.status_code == 401:
        logger.warning("Ideal Postcodes cleanse returned 401 (check API key)")
        return None
    if resp.status_code == 429:
        logger.warning("Ideal Postcodes cleanse rate limited (429)")
        return None
    if resp.status_code != 200:
        logger.info(
            "Ideal Postcodes cleanse HTTP %s: %s",
            resp.status_code,
            (resp.text or "")[:500],
        )
        return None

    try:
        data = resp.json()
    except ValueError:
        logger.warning("Ideal Postcodes cleanse: invalid JSON response")
        return None

    return data


def try_cleanse_uk_address_snapshot(address_snapshot: dict[str, Any]) -> bool:
    """
    Mutate ``address_snapshot`` (GB only) with cleansed PAF lines when the API
    returns a match above the configured confidence threshold.

    Returns True if any address field was updated.
    """
    if not getattr(settings, "IDEAL_POSTCODES_ENABLED", True):
        return False
    country = (address_snapshot.get("country") or "").strip().upper()
    if country not in ("", "GB", "UK"):
        return False
    if country == "UK":
        address_snapshot["country"] = "GB"

    q = _build_cleanse_query(address_snapshot)
    pc = (address_snapshot.get("postal_code") or "").strip() or None
    town = (address_snapshot.get("city") or "").strip() or None
    if not q and not pc and not town:
        return False

    data = cleanse_uk_address(query=q or (pc or town or ""), postcode=pc, post_town=town)
    if not isinstance(data, dict):
        return False
    if data.get("code") != IDEAL_POSTCODES_SUCCESS_CODE:
        return False

    result = data.get("result")
    if not isinstance(result, dict):
        return False
    count = float(result.get("count") or 0)
    confidence = float(result.get("confidence") or 0)
    if count < 1 or confidence < _min_confidence():
        logger.info(
            "Ideal Postcodes cleanse: no usable match (count=%s confidence=%s)",
            count,
            confidence,
        )
        return False

    match = result.get("match")
    if not isinstance(match, dict):
        return False

    new_fields = _paf_match_to_snapshot_fields(match)
    if not new_fields["address_line"] or not new_fields["postal_code"]:
        return False

    changed = any(
        (str(address_snapshot.get(k) or "").strip() != str(new_fields.get(k) or "").strip())
        for k in new_fields
    )
    prev_pc = (address_snapshot.get("postal_code") or "").strip()
    prev_line = ((address_snapshot.get("address_line") or "").strip())[:80]
    address_snapshot.update(new_fields)
    if changed:
        logger.info(
            "Applied Ideal Postcodes cleanse (confidence=%.3f): %s → %s; %s → %s",
            confidence,
            prev_pc or "(no postcode)",
            new_fields.get("postal_code"),
            prev_line or "(no line)",
            (new_fields.get("address_line") or "")[:80],
        )
    return changed
