import React, { forwardRef } from "react";
import {
  useEmailValidation,
  UseEmailValidationOptions,
} from "@/hooks/useEmailValidation";

export interface EmailInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "type" | "value" | "onChange"
  > {
  value?: string;
  onChange?: (email: string, isValid: boolean) => void;
  onValidationChange?: (
    isValid: boolean,
    error?: string,
    warning?: string
  ) => void;
  validationOptions?: UseEmailValidationOptions;
  showSuggestions?: boolean;
  showWarningIcon?: boolean;
  showErrorIcon?: boolean;
  className?: string;
  errorClassName?: string;
  warningClassName?: string;
  successClassName?: string;
}

export const EmailInput = forwardRef<HTMLInputElement, EmailInputProps>(
  (
    {
      value = "",
      onChange,
      onValidationChange,
      validationOptions = {},
      showSuggestions = true,
      showWarningIcon = true,
      showErrorIcon = true,
      errorClassName = "",
      warningClassName = "",
      successClassName = "",
      placeholder = "Enter your email address",
      required = false,
      disabled = false,
      className = "",
      onBlur: propOnBlur,
      onFocus: propOnFocus,
      ...restProps
    },
    ref
  ) => {
    // const [showPassword, setShowPassword] = useState(false);

    const {
      email,
      setEmail,
      isValid,
      error,
      warning,
      suggestions,
      isDirty,
      isTouched,
      handleBlur,
    } = useEmailValidation(value, validationOptions);

    // Handle email change
    const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newEmail = e.target.value;
      setEmail(newEmail);
      onChange?.(newEmail, isValid);
    };

    // Handle blur
    const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      handleBlur();
      propOnBlur?.(e);
    };

    // Notify parent of validation changes
    React.useEffect(() => {
      onValidationChange?.(isValid, error || undefined, warning || undefined);
    }, [isValid, error, warning, onValidationChange]);

    // Determine input state classes
    const getInputStateClasses = () => {
      if (disabled) return "";
      if (isDirty && isTouched) {
        if (isValid && !error) return successClassName;
        if (error) return errorClassName;
        if (warning) return warningClassName;
      }
      return "";
    };

    // Determine border color
    const getBorderColor = () => {
      if (disabled) return "var(--sidebar-border)";
      if (isDirty && isTouched) {
        if (isValid && !error) return "var(--success)";
        if (error) return "var(--destructive)";
        if (warning) return "var(--warning)";
      }
      return "var(--sidebar-border)";
    };

    return (
      <div className="space-y-2">
        {/* Email Input */}
        <div className="relative">
          <input
            ref={ref}
            type="email"
            value={email}
            onChange={(e) => {
              handleEmailChange(e);
            }}
            onBlur={(e) => {
              handleInputBlur(e);
              propOnBlur?.(e);
            }}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 transition-colors ${getInputStateClasses()} ${className}`}
            style={{
              backgroundColor: "var(--background)",
              borderColor: getBorderColor(),
              color: "var(--foreground)",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "var(--primary)";
              e.target.style.boxShadow = "0 0 0 2px rgba(17, 17, 17, 0.1)";
              propOnFocus?.(e);
            }}
            {...restProps}
          />

          {/* Status Icons */}
          {isDirty && isTouched && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              {error && showErrorIcon && (
                <svg
                  className="w-5 h-5"
                  style={{ color: "var(--destructive)" }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
              {warning && !error && showWarningIcon && (
                <svg
                  className="w-5 h-5"
                  style={{ color: "var(--warning)" }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              )}
              {isValid && !error && !warning && (
                <svg
                  className="w-5 h-5"
                  style={{ color: "var(--success)" }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && isDirty && isTouched && (
          <div
            className={`text-sm p-3 rounded-lg border ${errorClassName}`}
            style={{
              color: "var(--destructive)",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              borderColor: "rgba(239, 68, 68, 0.3)",
            }}
          >
            <div className="flex items-start">
              <svg
                className="w-4 h-4 mt-0.5 mr-2 flex-shrink-0"
                style={{ color: "var(--destructive)" }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Warning Message */}
        {warning && !error && isDirty && isTouched && (
          <div
            className={`text-sm p-3 rounded-lg border ${warningClassName}`}
            style={{
              color: "var(--warning)",
              backgroundColor: "rgba(251, 191, 36, 0.1)",
              borderColor: "rgba(251, 191, 36, 0.3)",
            }}
          >
            <div className="flex items-start">
              <svg
                className="w-4 h-4 mt-0.5 mr-2 flex-shrink-0"
                style={{ color: "var(--warning)" }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <span>{warning}</span>
            </div>
          </div>
        )}

        {/* Suggestions */}
        {showSuggestions && suggestions.length > 0 && isDirty && isTouched && (
          <div className="space-y-2">
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Did you mean:
            </p>
            <div className="space-y-1">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    setEmail(suggestion);
                    onChange?.(suggestion, true);
                  }}
                  className="text-sm text-left p-2 rounded border hover:opacity-80 transition-opacity w-full"
                  style={{
                    color: "var(--primary)",
                    borderColor: "var(--primary)",
                    backgroundColor: "transparent",
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);

EmailInput.displayName = "EmailInput";
