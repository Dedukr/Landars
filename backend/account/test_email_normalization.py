"""Vectors for ``account.email_normalization.normalize_email``.

The same vectors are asserted on the frontend
(``frontend-marketplace/src/utils/emailValidation.ts::normalizeEmail``); keep
both suites in sync (shared vector table: AUTH_FIX_PLAN.md section 5).
"""

from django.test import SimpleTestCase

from account.email_normalization import normalize_email

# Invisible characters added by autofill / copy-paste: ZWSP, ZWNJ, ZWJ,
# WORD JOINER, BOM, soft hyphen.
INVISIBLE = ["\u200b", "\u200c", "\u200d", "\u2060", "\ufeff", "\u00ad"]

SHARED_VECTORS = [
    ("  User@Example.COM  ", "user@example.com"),
    ("user@example.com\u200b", "user@example.com"),
    (" user@example.com ", "user@example.com"),
    ("ｕｓｅｒ＠ｅｘａｍｐｌｅ．ｃｏｍ", "user@example.com"),
    ("O'Brien+Tag@Example.com", "o'brien+tag@example.com"),
    ("a b@example.com", "a b@example.com"),
    ("", ""),
]


class NormalizeEmailVectorTests(SimpleTestCase):
    def test_shared_vectors(self):
        for raw, expected in SHARED_VECTORS:
            with self.subTest(raw=raw):
                self.assertEqual(normalize_email(raw), expected)

    def test_non_string_inputs_become_empty_string(self):
        for raw in (None, 123, 1.5, True, ["a@b.c"], ("a@b.c",), {"a": "b"}, b"a@b.c", object()):
            with self.subTest(raw=repr(raw)):
                self.assertEqual(normalize_email(raw), "")

    def test_nul_character_is_rejected_like_the_frontend(self):
        # PostgreSQL raises (HTTP 500) on NUL in query parameters; the frontend
        # normalizeEmail() returns "" for the same input.
        for raw in ("a\x00b@example.com", "\x00", "user@example.com\x00"):
            with self.subTest(raw=repr(raw)):
                self.assertEqual(normalize_email(raw), "")

    def test_never_raises_on_odd_strings(self):
        for raw in ("@", "a@", "@b", "\x00", "\t\n a@b.c \r\n", "ǅ@ǅ.com", "İ@example.com"):
            with self.subTest(raw=raw):
                self.assertIsInstance(normalize_email(raw), str)

    def test_each_invisible_char_removed_anywhere(self):
        for char in INVISIBLE:
            for raw in (
                f"user@example.com{char}",
                f"{char}user@example.com",
                f"us{char}er@exa{char}mple.com",
            ):
                with self.subTest(char=hex(ord(char)), raw=raw):
                    self.assertEqual(normalize_email(raw), "user@example.com")

    def test_only_invisible_or_whitespace_is_blank(self):
        self.assertEqual(normalize_email("   "), "")
        self.assertEqual(normalize_email("\u200b\ufeff"), "")
        self.assertEqual(normalize_email(" \t\n\u200b "), "")

    def test_non_breaking_space_is_trimmed(self):
        self.assertEqual(normalize_email(" user@example.com "), "user@example.com")

    def test_inner_space_is_kept_so_validators_can_reject_it(self):
        self.assertEqual(normalize_email("a b@example.com"), "a b@example.com")

    def test_idempotent(self):
        samples = [raw for raw, _ in SHARED_VECTORS] + [
            f"  MiXeD{char}@Example.COM " for char in INVISIBLE
        ]
        for raw in samples:
            with self.subTest(raw=raw):
                once = normalize_email(raw)
                self.assertEqual(normalize_email(once), once)

    def test_result_has_no_uppercase_or_edge_whitespace(self):
        result = normalize_email("  \u200bJohn.Doe+Tag@EXAMPLE.Com\ufeff  ")
        self.assertEqual(result, "john.doe+tag@example.com")
        self.assertEqual(result, result.strip())
        self.assertEqual(result, result.lower())
