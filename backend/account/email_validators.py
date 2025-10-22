"""
Comprehensive Email Validation for Django
Implements RFC 5322 compliant email validation with additional security checks
"""

import logging
import re
from typing import Dict, List, Optional, Tuple

from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

logger = logging.getLogger(__name__)

# RFC 5322 compliant email regex pattern
EMAIL_REGEX = re.compile(
    r"^[a-zA-Z0-9.!#$%&\'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"
)

# Common disposable email domains (partial list - in production, use a comprehensive service)
DISPOSABLE_EMAIL_DOMAINS = {
    "10minutemail.com",
    "tempmail.org",
    "guerrillamail.com",
    "mailinator.com",
    "temp-mail.org",
    "throwaway.email",
    "getnada.com",
    "maildrop.cc",
    "sharklasers.com",
    "grr.la",
    "guerrillamailblock.com",
    "pokemail.net",
    "spam4.me",
    "bccto.me",
    "chacuo.net",
    "dispostable.com",
    "mailnesia.com",
    "meltmail.com",
    "mohmal.com",
    "mytrashmail.com",
    "notmailinator.com",
    "spamgourmet.com",
    "spamspot.com",
    "trashmail.net",
    "trbvm.com",
    "wegwerfmail.de",
    "wegwerfmail.net",
    "wegwerfmail.org",
    "wetrainbayarea.com",
    "wetrainbayarea.org",
    "wh4f.org",
    "whyspam.me",
    "willselfdestruct.com",
    "wuzup.net",
    "wuzupmail.net",
    "www.e4ward.com",
    "www.gishpuppy.com",
    "www.mailinator.com",
    "wwwtrash.com",
    "x.ip6.li",
    "xagloo.com",
    "xemaps.com",
    "xents.com",
    "xmaily.com",
    "xoxy.net",
    "yapped.net",
    "yeah.net",
    "yopmail.com",
    "yopmail.net",
    "yopmail.org",
    "yopmail.pp.ua",
}

# Common typos in popular email domains
COMMON_DOMAIN_TYPOS = {
    "gmail.com": ["gmial.com", "gmail.co", "gmai.com", "gmail.cm", "gmail.con"],
    "yahoo.com": ["yaho.com", "yahoo.co", "yaho.com", "yahoo.cm", "yahoo.con"],
    "hotmail.com": [
        "hotmial.com",
        "hotmail.co",
        "hotmai.com",
        "hotmail.cm",
        "hotmail.con",
    ],
    "outlook.com": [
        "outlok.com",
        "outlook.co",
        "outlok.com",
        "outlook.cm",
        "outlook.con",
    ],
    "icloud.com": ["icloud.co", "icloud.cm", "icloud.con"],
    "aol.com": ["aol.co", "aol.cm", "aol.con"],
}

# Major email providers
MAJOR_EMAIL_PROVIDERS = {
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "icloud.com",
    "aol.com",
    "protonmail.com",
    "zoho.com",
    "yandex.com",
    "mail.ru",
}


class EmailValidationResult:
    """Result of email validation"""

    def __init__(
        self,
        is_valid: bool,
        error: Optional[str] = None,
        warning: Optional[str] = None,
        suggestions: Optional[List[str]] = None,
    ):
        self.is_valid = is_valid
        self.error = error
        self.warning = warning
        self.suggestions = suggestions or []


def validate_email_comprehensive(
    email: str, options: Optional[Dict] = None
) -> EmailValidationResult:
    """
    Comprehensive email validation with multiple checks

    Args:
        email: Email address to validate
        options: Validation options dict with keys:
            - allow_disposable: Allow disposable email addresses (default: False)
            - check_typos: Check for common typos (default: True)
            - max_length: Maximum email length (default: 254)
            - min_length: Minimum email length (default: 5)

    Returns:
        EmailValidationResult object
    """
    if options is None:
        options = {}

    allow_disposable = options.get("allow_disposable", False)
    check_typos = options.get("check_typos", True)
    max_length = options.get("max_length", 254)  # RFC 5321 limit
    min_length = options.get("min_length", 5)

    # Basic checks
    if not email or not isinstance(email, str):
        return EmailValidationResult(False, "Email address is required")

    email = email.strip().lower()

    # Length checks
    if len(email) < min_length:
        return EmailValidationResult(
            False, f"Email address must be at least {min_length} characters long"
        )

    if len(email) > max_length:
        return EmailValidationResult(
            False, f"Email address must be no more than {max_length} characters long"
        )

    # Basic format checks
    if "@" not in email:
        return EmailValidationResult(False, "Email address must contain an @ symbol")

    if email.count("@") > 1:
        return EmailValidationResult(
            False, "Email address can only contain one @ symbol"
        )

    # Split email into local and domain parts
    try:
        local_part, domain = email.split("@", 1)
    except ValueError:
        return EmailValidationResult(False, "Invalid email format")

    # Validate local part
    if not local_part:
        return EmailValidationResult(
            False, "Email address must have a local part before @"
        )

    if len(local_part) > 64:  # RFC 5321 limit
        return EmailValidationResult(
            False, "Local part of email address is too long (max 64 characters)"
        )

    # Validate domain part
    if not domain:
        return EmailValidationResult(False, "Email address must have a domain after @")

    if len(domain) > 253:  # RFC 5321 limit
        return EmailValidationResult(
            False, "Domain part of email address is too long (max 253 characters)"
        )

    # Check for consecutive dots
    if ".." in email:
        return EmailValidationResult(
            False, "Email address cannot contain consecutive dots"
        )

    # Check for dots at the beginning or end of local part
    if local_part.startswith(".") or local_part.endswith("."):
        return EmailValidationResult(
            False, "Email address cannot start or end with a dot"
        )

    # Check for dots at the beginning or end of domain
    if domain.startswith(".") or domain.endswith("."):
        return EmailValidationResult(False, "Domain cannot start or end with a dot")

    # RFC 5322 compliant regex validation
    if not EMAIL_REGEX.match(email):
        return EmailValidationResult(False, "Email address format is invalid")

    # Check for disposable email domains
    if not allow_disposable and is_disposable_email(domain):
        return EmailValidationResult(
            False, "Disposable email addresses are not allowed"
        )

    # Check for common typos
    if check_typos:
        typo_suggestion = check_for_common_typos(domain)
        if typo_suggestion:
            return EmailValidationResult(
                True,
                warning=f"Did you mean {typo_suggestion}?",
                suggestions=[typo_suggestion],
            )

    return EmailValidationResult(True)


def is_disposable_email(domain: str) -> bool:
    """Check if email domain is disposable"""
    return domain in DISPOSABLE_EMAIL_DOMAINS


def check_for_common_typos(domain: str) -> Optional[str]:
    """Check for common typos in email domains"""
    for correct_domain, typos in COMMON_DOMAIN_TYPOS.items():
        if domain in typos:
            return correct_domain
    return None


def is_major_email_provider(domain: str) -> bool:
    """Check if email domain is from a major provider"""
    return domain in MAJOR_EMAIL_PROVIDERS


def sanitize_email(email: str) -> str:
    """Sanitize email address for safe storage"""
    return email.strip().lower()


def extract_domain(email: str) -> Optional[str]:
    """Extract domain from email address"""
    try:
        return email.split("@")[1]
    except (IndexError, AttributeError):
        return None


class ComprehensiveEmailValidator:
    """Django validator for comprehensive email validation"""

    def __init__(self, allow_disposable: bool = False, check_typos: bool = True):
        self.allow_disposable = allow_disposable
        self.check_typos = check_typos

    def __call__(self, value):
        result = validate_email_comprehensive(
            value,
            {
                "allow_disposable": self.allow_disposable,
                "check_typos": self.check_typos,
            },
        )

        if not result.is_valid:
            raise ValidationError(result.error)

        if result.warning:
            # Log warning but don't fail validation
            logger.warning(
                f"Email validation warning: {result.warning} for email: {value}"
            )


def validate_email_field(
    email: str, allow_disposable: bool = False
) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Validate email field and return (is_valid, error, warning)

    Args:
        email: Email address to validate
        allow_disposable: Whether to allow disposable email addresses

    Returns:
        Tuple of (is_valid, error_message, warning_message)
    """
    result = validate_email_comprehensive(email, {"allow_disposable": allow_disposable})

    return result.is_valid, result.error, result.warning
