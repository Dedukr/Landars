"""
Whole-word search helpers (match words, not arbitrary letter substrings).

PostgreSQL: POSIX \\y word boundaries via iregex.
SQLite / others: Python re \\b (Unicode-aware for str) via Django iregex.
"""

import re

from django.db import connection


def whole_word_regex_pattern(term: str) -> str:
    """
    Pattern for CharField__iregex so `term` matches only as a complete word.

    - PostgreSQL: \\y (word boundary per POSIX rules in PG).
    - SQLite: Django wires REGEXP to Python re; \\b gives word boundaries on str.
    """
    t = (term or "").strip()
    if not t:
        raise ValueError("whole_word_regex_pattern requires a non-empty term")
    escaped = re.escape(t)
    if connection.vendor == "postgresql":
        return rf"\y{escaped}\y"
    # SQLite and other backends that implement iregex via Python re
    return rf"\b{escaped}\b"
