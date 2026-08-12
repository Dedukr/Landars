import { useState, useCallback, useRef, useEffect } from "react";
import {
  validateEmail,
  EmailValidationResult,
  EmailValidationOptions,
  createDebouncedEmailValidator,
} from "@/utils/emailValidation";

export interface UseEmailValidationOptions extends EmailValidationOptions {
  debounceMs?: number;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
}

export interface UseEmailValidationReturn {
  email: string;
  setEmail: (email: string) => void;
  validationResult: EmailValidationResult | null;
  isValid: boolean;
  error: string | null;
  warning: string | null;
  suggestions: string[];
  isDirty: boolean;
  isTouched: boolean;
  reset: () => void;
  handleBlur: () => void;
  /** Mark field touched and validate immediately (e.g. on form submit). */
  showErrors: () => EmailValidationResult;
}

/**
 * Custom hook for email validation with real-time feedback
 */
export function useEmailValidation(
  initialEmail: string = "",
  options: UseEmailValidationOptions = {}
): UseEmailValidationReturn {
  const {
    debounceMs = 500,
    validateOnChange = true,
    validateOnBlur = true,
    ...validationOptions
  } = options;

  const [email, setEmailState] = useState(initialEmail);
  const [validationResult, setValidationResult] =
    useState<EmailValidationResult | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isTouched, setIsTouched] = useState(false);

  // Sync controlled value from parent
  useEffect(() => {
    if (initialEmail !== email) {
      setEmailState(initialEmail);
    }
    // Only sync when the controlled prop changes, not when local email edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEmail]);

  // Stabilize options so inline objects from parents don't recreate the debouncer
  const allowDisposable = validationOptions.allowDisposable;
  const checkTypos = validationOptions.checkTypos;
  const maxLength = validationOptions.maxLength;
  const minLength = validationOptions.minLength;

  // Create debounced validator using ref to avoid recreation
  const debouncedValidatorRef = useRef<((email: string) => void) | null>(null);

  useEffect(() => {
    const options: EmailValidationOptions = {
      allowDisposable,
      checkTypos,
      maxLength,
      minLength,
    };
    debouncedValidatorRef.current = createDebouncedEmailValidator(
      (result) => {
        setValidationResult(result);
      },
      debounceMs,
      options
    );
  }, [debounceMs, allowDisposable, checkTypos, maxLength, minLength]);

  const debouncedValidator = useCallback((emailToValidate: string) => {
    if (debouncedValidatorRef.current) {
      debouncedValidatorRef.current(emailToValidate);
    }
  }, []);

  // Immediate validation function
  const validateImmediately = useCallback(
    (emailToValidate: string) => {
      const result = validateEmail(emailToValidate, {
        allowDisposable,
        checkTypos,
        maxLength,
        minLength,
      });
      setValidationResult(result);
      return result;
    },
    [allowDisposable, checkTypos, maxLength, minLength]
  );

  // Set email with validation
  const setEmail = useCallback(
    (newEmail: string) => {
      setEmailState(newEmail);
      setIsDirty(true);

      if (validateOnChange && newEmail.length > 0) {
        if (debounceMs > 0) {
          debouncedValidator(newEmail);
        } else {
          validateImmediately(newEmail);
        }
      }
    },
    [validateOnChange, debounceMs, debouncedValidator, validateImmediately]
  );

  // Handle blur event
  const handleBlur = useCallback(() => {
    setIsTouched(true);
    if (validateOnBlur) {
      validateImmediately(email);
    }
  }, [validateOnBlur, validateImmediately, email]);

  const showErrors = useCallback(() => {
    setIsDirty(true);
    setIsTouched(true);
    return validateImmediately(email);
  }, [validateImmediately, email]);

  // Reset function
  const reset = useCallback(() => {
    setEmailState(initialEmail);
    setValidationResult(null);
    setIsDirty(false);
    setIsTouched(false);
  }, [initialEmail]);

  // Computed values
  const isValid = validationResult?.isValid ?? false;
  const error = validationResult?.error ?? null;
  const warning = validationResult?.warning ?? null;
  const suggestions = validationResult?.suggestions ?? [];

  return {
    email,
    setEmail,
    validationResult,
    isValid,
    error,
    warning,
    suggestions,
    isDirty,
    isTouched,
    reset,
    handleBlur,
    showErrors,
  };
}

/**
 * Hook for form-level email validation
 */
export function useFormEmailValidation(
  initialEmail: string = "",
  options: UseEmailValidationOptions = {}
) {
  const emailValidation = useEmailValidation(initialEmail, options);

  const validateFormEmail = useCallback(() => {
    return validateEmail(emailValidation.email, options);
  }, [emailValidation.email, options]);

  return {
    ...emailValidation,
    validateFormEmail,
  };
}
