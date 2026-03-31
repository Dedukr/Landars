"""Extract Sendcloud parcel payload fields for persistence (Step E)."""

from __future__ import annotations

from typing import Any


def label_pdf_url_from_parcel_dict(parcel: dict[str, Any]) -> str | None:
    """Pick a single PDF URL from the parcel ``label`` object (create or labels API)."""
    label = parcel.get("label") or {}
    if not isinstance(label, dict):
        return None
    for key in (
        "a6_right",
        "a6_left",
        "normal_printer",
        "label_printer",
    ):
        raw = label.get(key)
        if isinstance(raw, list) and raw:
            u = raw[0]
            if isinstance(u, str) and u.startswith("http"):
                return u
        if isinstance(raw, str) and raw.startswith("http"):
            return raw
    return None


def provider_status_from_parcel(parcel: dict[str, Any]) -> tuple[str, str]:
    """``status`` object → ``(id, message)`` as strings."""
    st = parcel.get("status")
    if not isinstance(st, dict):
        return "", ""
    sid = st.get("id")
    msg = st.get("message")
    sid_s = "" if sid is None else str(sid)
    msg_s = (str(msg) if msg is not None else "").strip()
    return sid_s, msg_s


def provider_urls_from_documents(parcel: dict[str, Any]) -> tuple[str, str]:
    """
    Prefer ``documents[]`` entries: type ``label`` → label URL; first other type
    with ``link`` → document URL (customs, commercial invoice, etc.).
    """
    label_url = ""
    doc_url = ""
    docs = parcel.get("documents")
    if isinstance(docs, list):
        for d in docs:
            if not isinstance(d, dict):
                continue
            link = (d.get("link") or "").strip()
            if not link:
                continue
            typ = (d.get("type") or "").lower()
            if typ == "label":
                if not label_url:
                    label_url = link
            elif not doc_url:
                doc_url = link
    return label_url, doc_url


def resolve_provider_label_and_document_url(parcel: dict[str, Any]) -> tuple[str, str]:
    """
    Final provider label URL (shipping label) and a representative document URL
    (non-label), falling back to the embedded ``label`` object when needed.
    """
    label_u, doc_u = provider_urls_from_documents(parcel)
    if not label_u:
        fallback = label_pdf_url_from_parcel_dict(parcel) or ""
        label_u = fallback
    return label_u, doc_u


def document_url_from_labels_api_response(payload: dict[str, Any]) -> str:
    """Optional customs doc URL from GET /labels/{parcel_id} ``customs_declaration``."""
    cd = payload.get("customs_declaration") or {}
    if not isinstance(cd, dict):
        return ""
    u = cd.get("normal_printer")
    if isinstance(u, str) and u.startswith("http"):
        return u
    return ""
