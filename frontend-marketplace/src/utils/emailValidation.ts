/**
 * Comprehensive Email Validation Utility
 * Implements RFC 5322 compliant email validation with additional security checks
 */

// RFC 5322 compliant email regex pattern
// This pattern is more comprehensive than basic patterns and handles most valid email formats
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Common disposable email domains (partial list - in production, use a comprehensive service)
const DISPOSABLE_EMAIL_DOMAINS = [
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
  "wegwerpmailadres.nl",
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
  "yopmail.com",
  "yopmail.net",
  "yopmail.org",
  "ypmail.webarnak.fr",
  "yopmail.pp.ua",
  "yopmail.com",
  "yopmail.net",
  "yopmail.org",
  "ypmail.webarnak.fr",
  "yopmail.pp.ua",
  "yopmail.com",
  "yopmail.net",
  "yopmail.org",
  "ypmail.webarnak.fr",
  "yopmail.pp.ua",
];

// Common typos in popular email domains
const COMMON_DOMAIN_TYPOS = {
  "gmail.com": [
    "gmial.com",
    "gmail.co",
    "gmai.com",
    "gmail.cm",
    "gmail.con",
    "gamil.com",
    "gmal.com",
  ],
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
};

// Invisible characters that autofill, password managers and copy/paste add to
// an address: ZWSP, ZWNJ, ZWJ, WORD JOINER, BOM and SOFT HYPHEN. Keep in sync
// with backend/account/email_normalization.py.
const INVISIBLE_EMAIL_CHARS = /[\u200B\u200C\u200D\u2060\uFEFF\u00AD]/g;

/**
 * Canonical email form shared by every authentication flow. Mirrors
 * `backend/account/email_normalization.py::normalize_email` step for step
 * (both test suites assert the same vectors):
 *
 * 1. NFKC (fullwidth at-sign/letters and non-breaking spaces become ASCII)
 * 2. drop invisible characters (see INVISIBLE_EMAIL_CHARS)
 * 3. trim surrounding whitespace
 * 4. lowercase
 *
 * Never throws: anything that is not a string (or contains a NUL) yields `""`.
 */
export function normalizeEmail(value: unknown): string {
  // NUL is never part of an address (and PostgreSQL rejects it): same rule as the backend.
  if (typeof value !== "string" || value.includes("\0")) return "";
  return value
    .normalize("NFKC")
    .replace(INVISIBLE_EMAIL_CHARS, "")
    .trim()
    .toLowerCase();
}

export interface EmailValidationResult {
  isValid: boolean;
  error?: string;
  warning?: string;
  suggestions?: string[];
}

export interface EmailValidationOptions {
  allowDisposable?: boolean;
  checkTypos?: boolean;
  maxLength?: number;
  minLength?: number;
}

/**
 * Validates an email address with comprehensive checks
 */
export function validateEmail(
  email: string,
  options: EmailValidationOptions = {}
): EmailValidationResult {
  const {
    allowDisposable = false,
    checkTypos = true,
    maxLength = 254, // RFC 5321 limit
    minLength = 5,
  } = options;

  // Basic checks
  if (!email || typeof email !== "string") {
    return {
      isValid: false,
      error: "Email address is required",
    };
  }

  // Validate exactly what the forms send (and the backend stores)
  const trimmedEmail = normalizeEmail(email);

  // Length checks
  if (trimmedEmail.length < minLength) {
    return {
      isValid: false,
      error: `Email address must be at least ${minLength} characters long`,
    };
  }

  if (trimmedEmail.length > maxLength) {
    return {
      isValid: false,
      error: `Email address must be no more than ${maxLength} characters long`,
    };
  }

  // Basic format check
  if (!trimmedEmail.includes("@")) {
    return {
      isValid: false,
      error: "Enter a valid email address",
    };
  }

  // Check for multiple @ symbols
  const atCount = (trimmedEmail.match(/@/g) || []).length;
  if (atCount > 1) {
    return {
      isValid: false,
      error: "Enter a valid email address",
    };
  }

  // Split email into local and domain parts
  const [localPart, domain] = trimmedEmail.split("@");

  // Validate local part
  if (!localPart || localPart.length === 0) {
    return {
      isValid: false,
      error: "Enter a valid email address",
    };
  }

  if (localPart.length > 64) {
    // RFC 5321 limit
    return {
      isValid: false,
      error: "Local part of email address is too long (max 64 characters)",
    };
  }

  // Validate domain part
  if (!domain || domain.length === 0) {
    return {
      isValid: false,
      error: "Enter a valid email address",
    };
  }

  if (domain.length > 253) {
    // RFC 5321 limit
    return {
      isValid: false,
      error: "Domain part of email address is too long (max 253 characters)",
    };
  }

  // Check for consecutive dots
  if (trimmedEmail.includes("..")) {
    return {
      isValid: false,
      error: "Enter a valid email address",
    };
  }

  // Check for dots at the beginning or end of local part
  if (localPart.startsWith(".") || localPart.endsWith(".")) {
    return {
      isValid: false,
      error: "Enter a valid email address",
    };
  }

  // Check for dots at the beginning or end of domain
  if (domain.startsWith(".") || domain.endsWith(".")) {
    return {
      isValid: false,
      error: "Enter a valid email address",
    };
  }

  // Domain should include a TLD (at least one dot), e.g. example.com
  if (!domain.includes(".")) {
    return {
      isValid: false,
      error: "Enter a valid email address",
    };
  }

  // RFC 5322 compliant regex validation
  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return {
      isValid: false,
      error: "Enter a valid email address",
    };
  }

  // Check for disposable email domains
  if (!allowDisposable && isDisposableEmail(trimmedEmail)) {
    return {
      isValid: false,
      error: "Disposable email addresses are not allowed",
      warning: "Please use a permanent email address",
    };
  }

  // Check for common typos (suggest the normalised address, not the raw input)
  if (checkTypos) {
    const typoSuggestion = checkForCommonTypos(localPart, domain);
    if (typoSuggestion) {
      return {
        isValid: true,
        warning: `Did you mean ${typoSuggestion}?`,
        suggestions: [typoSuggestion],
      };
    }
  }

  return {
    isValid: true,
  };
}

/**
 * Checks if an email domain is disposable
 */
function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1];
  return DISPOSABLE_EMAIL_DOMAINS.includes(domain);
}

/**
 * Checks for common typos in email domains
 */
function checkForCommonTypos(
  localPart: string,
  domain: string
): string | null {
  for (const [correctDomain, typos] of Object.entries(COMMON_DOMAIN_TYPOS)) {
    if (typos.includes(domain)) {
      return `${localPart}@${correctDomain}`;
    }
  }
  return null;
}

/**
 * Sanitizes an email address for safe storage (same canonical form as
 * {@link normalizeEmail}).
 */
export function sanitizeEmail(email: string): string {
  return normalizeEmail(email);
}

/**
 * Formats an email address for display
 */
export function formatEmailForDisplay(email: string): string {
  const sanitized = sanitizeEmail(email);
  // Mask the local part for privacy: user@domain.com -> u***@domain.com
  const [localPart, domain] = sanitized.split("@");
  if (localPart.length <= 2) {
    return sanitized; // Don't mask very short local parts
  }
  const maskedLocal =
    localPart[0] +
    "*".repeat(localPart.length - 2) +
    localPart[localPart.length - 1];
  return `${maskedLocal}@${domain}`;
}

/**
 * Extracts domain from email address
 */
export function extractDomain(email: string): string | null {
  const parts = email.split("@");
  return parts.length === 2 ? parts[1] : null;
}

/**
 * Checks if email domain is from a major provider
 */
export function isMajorEmailProvider(email: string): boolean {
  const domain = extractDomain(email);
  if (!domain) return false;

  const majorProviders = [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "icloud.com",
    "aol.com",
    "protonmail.com",
    "zoho.com",
  ];

  return majorProviders.includes(domain);
}

/**
 * Real-time email validation for form inputs
 */
export function createEmailValidator(options: EmailValidationOptions = {}) {
  return (email: string): EmailValidationResult => {
    return validateEmail(email, options);
  };
}

/**
 * Debounced email validation for real-time feedback
 */
export function createDebouncedEmailValidator(
  callback: (result: EmailValidationResult) => void,
  delay: number = 500,
  options: EmailValidationOptions = {}
) {
  let timeoutId: NodeJS.Timeout;

  return (email: string) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      const result = validateEmail(email, options);
      callback(result);
    }, delay);
  };
}
