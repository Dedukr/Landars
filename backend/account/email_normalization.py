"""Canonical email normalisation for every authentication flow.

Single source of truth used by register, login, resend-verification,
password-reset, profile update, the user model and management commands.
The frontend mirrors this exactly in
``frontend-marketplace/src/utils/emailValidation.ts::normalizeEmail`` - keep
the two in sync (both test suites assert the same vectors).

Steps, in order:

1. NFKC - fullwidth ``＠`` / letters typed by CJK input methods become ASCII and
   non-breaking spaces become plain spaces.
2. Drop invisible characters that autofill, password managers and copy/paste
   from web pages or PDFs add (ZWSP, ZWNJ, ZWJ, WORD JOINER, BOM, soft hyphen).
3. Strip surrounding whitespace.
4. Lowercase.

Input containing a NUL character normalises to ``""`` (treated as missing).
"""

import re
import unicodedata

_INVISIBLE_CHARS = re.compile("[\u200b\u200c\u200d\u2060\ufeff\u00ad]")


def normalize_email(value) -> str:
    """Return the canonical email string, or ``""`` for ``None``/non-string input.

    Never raises: callers treat ``""`` as "missing" and return a normal 400
    instead of a 500 when a client sends ``null``, a number or a list.
    """
    if not isinstance(value, str) or "\x00" in value:
        # NUL is never part of an address and PostgreSQL raises (500) on it in lookups.
        return ""
    text = unicodedata.normalize("NFKC", value)
    text = _INVISIBLE_CHARS.sub("", text)
    return text.strip().lower()
