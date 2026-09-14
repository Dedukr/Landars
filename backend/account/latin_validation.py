"""Require Latin-script letters for names and address fields (Sendcloud / UK shipping)."""

from __future__ import annotations

import unicodedata

LATIN_SCRIPT_ERROR = "Use Latin characters only"


def is_latin_script_text(value: str | None) -> bool:
    """
    Return True when ``value`` is empty or every *letter* is Latin-script.

    Digits, whitespace, punctuation, and symbols are allowed (including
    typographic marks from mobile keyboards). Cyrillic and other non-Latin
    letters are rejected. Accented Latin (e.g. José, Müller) is OK.
    """
    text = value if value is not None else ""
    if not str(text).strip():
        return True

    for ch in str(text):
        # Only alphabetic characters are constrained to Latin script.
        # Punctuation / symbols (curly apostrophes, dashes, £, etc.) pass.
        if not ch.isalpha():
            continue
        name = unicodedata.name(ch, "")
        if not name.startswith("LATIN"):
            return False
    return True


def latin_script_error(value: str | None) -> str | None:
    """Return an error message when ``value`` is not Latin-script text."""
    if is_latin_script_text(value):
        return None
    return LATIN_SCRIPT_ERROR


def add_latin_script_errors(form, field_names: tuple[str, ...] | list[str]) -> None:
    """
    Attach Latin-script errors for any non-empty cleaned values on ``field_names``.

    Skips fields that are not on the form or already have errors.
    """
    cleaned = getattr(form, "cleaned_data", None) or {}
    for name in field_names:
        if name not in getattr(form, "fields", {}):
            continue
        if form.errors.get(name):
            continue
        message = latin_script_error(cleaned.get(name))
        if message:
            form.add_error(name, message)
