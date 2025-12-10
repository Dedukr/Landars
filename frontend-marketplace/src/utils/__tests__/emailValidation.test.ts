/**
 * Tests for Email Validation Utility
 */
import {
  validateEmail,
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
});
