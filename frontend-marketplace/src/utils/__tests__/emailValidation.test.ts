/**
 * Tests for Email Validation Utility
 */
import {
  validateEmail,
  normalizeEmail,
  sanitizeEmail,
  formatEmailForDisplay,
  extractDomain,
  isMajorEmailProvider,
  createEmailValidator,
  createDebouncedEmailValidator,
} from "../emailValidation";

describe("Email Validation", () => {
  describe("validateEmail", () => {
    it("should validate correct email addresses", () => {
      const validEmails = [
        "test@example.com",
        "user.name@domain.co.uk",
        "user+tag@example.org",
        "user123@test-domain.com",
        "a@b.co",
        "user@subdomain.example.com",
      ];

      validEmails.forEach((email) => {
        const result = validateEmail(email);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it("should reject invalid email addresses", () => {
      const invalidEmails = [
        "",
        "invalid",
        "@example.com",
        "user@",
        "user..name@example.com",
        "user@.example.com",
        "user@example.",
        "user name@example.com",
        "user@example..com",
        "user@example.com.",
        "user@example.com..",
      ];

      invalidEmails.forEach((email) => {
        const result = validateEmail(email);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    it("should detect disposable email addresses", () => {
      const disposableEmails = [
        "test@10minutemail.com",
        "user@tempmail.org",
        "test@guerrillamail.com",
      ];

      disposableEmails.forEach((email) => {
        const result = validateEmail(email, { allowDisposable: false });
        expect(result.isValid).toBe(false);
        expect(result.error).toContain("Disposable");
      });
    });

    it("should allow disposable emails when configured", () => {
      const result = validateEmail("test@10minutemail.com", {
        allowDisposable: true,
      });
      expect(result.isValid).toBe(true);
    });

    it("should allow yeah.net (aligned with backend allowlist)", () => {
      const result = validateEmail("user@yeah.net", {
        allowDisposable: false,
      });
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should detect common typos", () => {
      const result = validateEmail("test@gmial.com");
      expect(result.isValid).toBe(true);
      expect(result.warning).toContain("Did you mean");
      expect(result.suggestions).toContain("test@gmail.com");
    });

    it("should enforce length limits", () => {
      const longEmail = "a".repeat(250) + "@example.com";
      const result = validateEmail(longEmail);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("no more than 254 characters");
    });
  });

  describe("sanitizeEmail", () => {
    it("should trim and lowercase email addresses", () => {
      expect(sanitizeEmail("  TEST@EXAMPLE.COM  ")).toBe("test@example.com");
    });
  });

  describe("formatEmailForDisplay", () => {
    it("should mask email addresses for privacy", () => {
      // "user" has 4 chars: u + ** + r (2 middle chars masked)
      expect(formatEmailForDisplay("user@example.com")).toBe(
        "u**r@example.com"
      );
      expect(formatEmailForDisplay("a@example.com")).toBe("a@example.com"); // Don't mask very short emails
    });
  });

  describe("extractDomain", () => {
    it("should extract domain from email addresses", () => {
      expect(extractDomain("user@example.com")).toBe("example.com");
      expect(extractDomain("invalid")).toBe(null);
    });
  });

  describe("isMajorEmailProvider", () => {
    it("should identify major email providers", () => {
      // Function expects full email address, not just domain
      expect(isMajorEmailProvider("test@gmail.com")).toBe(true);
      expect(isMajorEmailProvider("test@yahoo.com")).toBe(true);
      expect(isMajorEmailProvider("test@example.com")).toBe(false);
    });
  });

  describe("createEmailValidator", () => {
    it("should create a validator function", () => {
      const validator = createEmailValidator({ allowDisposable: false });
      const result = validator("test@example.com");
      expect(result.isValid).toBe(true);
    });
  });

  describe("createDebouncedEmailValidator", () => {
    it("should create a debounced validator", (done) => {
      const callback = jest.fn();
      const validator = createDebouncedEmailValidator(callback, 100);

      validator("test@example.com");

      setTimeout(() => {
        expect(callback).toHaveBeenCalled();
        done();
      }, 150);
    });
  });

  describe("normalizeEmail (shared vectors with backend normalize_email)", () => {
    it("rejects input containing a NUL character (same rule as the backend)", () => {
      expect(normalizeEmail("a\0b@example.com")).toBe("");
      expect(normalizeEmail("\0")).toBe("");
    });

    const ZWSP = "\u200B";
    const vectors: Array<[string, string]> = [
      ["  User@Example.COM  ", "user@example.com"],
      [`user@example.com${ZWSP}`, "user@example.com"],
      [" user@example.com ", "user@example.com"],
      [
        "\uFF55\uFF53\uFF45\uFF52\uFF20\uFF45\uFF58\uFF41\uFF4D\uFF50\uFF4C\uFF45\uFF0E\uFF43\uFF4F\uFF4D",
        "user@example.com",
      ],
      ["O'Brien+Tag@Example.com", "o'brien+tag@example.com"],
      ["a b@example.com", "a b@example.com"],
    ];

    it.each(vectors)("normalises %j", (input, expected) => {
      expect(normalizeEmail(input)).toBe(expected);
    });

    it("returns an empty string for non-strings", () => {
      for (const value of ["", null, undefined, 123, ["a@b.c"], {}, true]) {
        expect(normalizeEmail(value)).toBe("");
      }
    });

    it("removes every invisible character the backend removes", () => {
      const invisible = "\u200B\u200C\u200D\u2060\uFEFF\u00AD";
      expect(normalizeEmail(`us${invisible}er@exa${invisible}mple.com`)).toBe(
        "user@example.com"
      );
    });

    it("turns non-breaking and ideographic spaces into trimmed whitespace", () => {
      expect(normalizeEmail("\u00A0user@example.com\u3000")).toBe(
        "user@example.com"
      );
    });

    it("is idempotent", () => {
      for (const [input] of vectors) {
        const once = normalizeEmail(input);
        expect(normalizeEmail(once)).toBe(once);
      }
    });

    it("is what sanitizeEmail returns", () => {
      for (const [input, expected] of vectors) {
        expect(sanitizeEmail(input)).toBe(expected);
      }
    });
  });

  describe("validateEmail with un-normalised input", () => {
    it("accepts what the forms will actually send", () => {
      expect(validateEmail("  USER@Example.COM  ").isValid).toBe(true);
      expect(validateEmail("user@example.com\u200B").isValid).toBe(true);
      expect(
        validateEmail(
          "\uFF55\uFF53\uFF45\uFF52\uFF20\uFF45\uFF58\uFF41\uFF4D\uFF50\uFF4C\uFF45\uFF0E\uFF43\uFF4F\uFF4D"
        ).isValid
      ).toBe(true);
    });

    it("still rejects an inner space", () => {
      expect(validateEmail("a b@example.com").isValid).toBe(false);
    });

    it("rejects an address that is only invisible characters", () => {
      expect(validateEmail("\u200B\u200B\u200B\u200B\u200B\u200B").isValid).toBe(
        false
      );
    });

    it("suggests the normalised, corrected address for a typo'd domain", () => {
      const result = validateEmail("  Test@GMIAL.com ");
      expect(result.isValid).toBe(true);
      expect(result.suggestions).toEqual(["test@gmail.com"]);
      expect(result.warning).toBe("Did you mean test@gmail.com?");
    });

    it("only replaces the domain, never a lookalike in the local part", () => {
      expect(validateEmail("gmial.com@gmial.com").suggestions).toEqual([
        "gmial.com@gmail.com",
      ]);
    });

    it("catches the very common .con typo", () => {
      expect(validateEmail("jo@gmail.con").suggestions).toEqual(["jo@gmail.com"]);
      expect(validateEmail("jo@hotmail.con").suggestions).toEqual([
        "jo@hotmail.com",
      ]);
    });

    it("does not suggest anything when typo checks are off", () => {
      const result = validateEmail("test@gmial.com", { checkTypos: false });
      expect(result.isValid).toBe(true);
      expect(result.suggestions).toBeUndefined();
    });
  });
});
