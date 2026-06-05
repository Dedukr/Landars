"""Helpers for splitting and displaying user names."""


def split_legacy_name(full_name: str) -> tuple[str | None, str | None]:
    """
    Migrate a legacy single ``name`` value into first name + surname.

    - Exactly two whitespace-separated words → first word, second word.
    - Otherwise → entire string as first name, surname empty.
    """
    full_name = (full_name or "").strip()
    if not full_name:
        return None, None
    parts = full_name.split()
    if len(parts) == 2:
        return parts[0], parts[1]
    return full_name, None


def display_name_from_parts(
    first_name: str | None, surname: str | None, *, fallback_name: str | None = None
) -> str:
    """Build a display name from first name and surname, with optional legacy fallback."""
    parts = [p.strip() for p in (first_name, surname) if p and str(p).strip()]
    if parts:
        return " ".join(parts)
    return (fallback_name or "").strip()
