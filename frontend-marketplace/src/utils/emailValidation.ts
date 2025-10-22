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
  "yeah.net",
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
  "gmail.com": ["gmial.com", "gmail.co", "gmai.com", "gmail.cm"],
  "yahoo.com": ["yaho.com", "yahoo.co", "yaho.com", "yahoo.cm"],
  "hotmail.com": ["hotmial.com", "hotmail.co", "hotmai.com", "hotmail.cm"],
  "outlook.com": ["outlok.com", "outlook.co", "outlok.com", "outlook.cm"],
};

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

  const trimmedEmail = email.trim().toLowerCase();

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
      error: "Email address must contain an @ symbol",
    };
  }

  // Check for multiple @ symbols
  const atCount = (trimmedEmail.match(/@/g) || []).length;
  if (atCount > 1) {
    return {
      isValid: false,
      error: "Email address can only contain one @ symbol",
    };
  }

  // Split email into local and domain parts
  const [localPart, domain] = trimmedEmail.split("@");

  // Validate local part
  if (!localPart || localPart.length === 0) {
    return {
      isValid: false,
      error: "Email address must have a local part before @",
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
      error: "Email address must have a domain after @",
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
      error: "Email address cannot contain consecutive dots",
    };
  }

  // Check for dots at the beginning or end of local part
  if (localPart.startsWith(".") || localPart.endsWith(".")) {
    return {
      isValid: false,
      error: "Email address cannot start or end with a dot",
    };
  }

  // Check for dots at the beginning or end of domain
  if (domain.startsWith(".") || domain.endsWith(".")) {
    return {
      isValid: false,
      error: "Domain cannot start or end with a dot",
    };
  }

  // RFC 5322 compliant regex validation
  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return {
      isValid: false,
      error: "Email address format is invalid",
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

  // Check for common typos
  if (checkTypos) {
    const typoSuggestion = checkForCommonTypos(email, domain);
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
function checkForCommonTypos(email: string, domain: string): string | null {
  for (const [correctDomain, typos] of Object.entries(COMMON_DOMAIN_TYPOS)) {
    if (typos.includes(domain)) {
      return email.replace(domain, correctDomain);
    }
  }
  return null;
}

/**
 * Sanitizes an email address for safe storage
 */
export function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
