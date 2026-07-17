from django.test import SimpleTestCase

from account.address_validation import validate_street_address
from account.latin_validation import is_latin_script_text, latin_script_error


class LatinScriptValidationTests(SimpleTestCase):
    def test_accepts_ascii_and_accented_latin(self):
        self.assertTrue(is_latin_script_text("José García"))
        self.assertTrue(is_latin_script_text("Müller"))
        self.assertTrue(is_latin_script_text("10 High Street, Flat 2"))
        self.assertTrue(is_latin_script_text("SW1A 1AA"))

    def test_rejects_cyrillic(self):
        self.assertFalse(is_latin_script_text("Юлія"))
        self.assertEqual(latin_script_error("Київ"), "Use Latin characters only")

    def test_street_address_rejects_non_latin_city(self):
        errors = validate_street_address(
            address_line="10 High Street",
            city="Київ",
            postal_code="SW1A 1AA",
        )
        self.assertEqual(errors.get("city"), "Use Latin characters only")
