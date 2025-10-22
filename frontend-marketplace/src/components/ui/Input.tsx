import React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = "text",
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      fullWidth = false,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    const baseStyles = [
      // Base input styles
      "flex w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--card-bg)] px-3 py-2 text-sm",
      "text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]",
      "focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "transition-colors duration-200",
      // Ensure minimum touch target for mobile
      "min-h-[44px]",
    ];

    const widthStyles = fullWidth ? "w-full" : "";

    const errorStyles = error
      ? [
          "border-[var(--destructive)] focus:ring-[var(--destructive)]",
          "focus:border-[var(--destructive)]",
        ]
      : [];

    const inputElement = (
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--muted-foreground)]">
            {leftIcon}
          </div>
        )}
        <input
          type={type}
          className={cn(
            baseStyles,
            widthStyles,
            errorStyles,
            leftIcon && "pl-10",
            rightIcon && "pr-10",
            className
          )}
          ref={ref}
          id={inputId}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[var(--muted-foreground)]">
            {rightIcon}
          </div>
        )}
      </div>
    );

    if (label || error || helperText) {
      return (
        <div className={cn("space-y-2", fullWidth ? "w-full" : "")}>
          {label && (
            <label
              htmlFor={inputId}
              className="text-sm font-medium text-[var(--foreground)]"
            >
              {label}
            </label>
          )}
          {inputElement}
          {error && (
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          )}
          {helperText && !error && (
            <p className="text-sm text-[var(--muted-foreground)]">
              {helperText}
            </p>
          )}
        </div>
      );
    }

    return inputElement;
  }
);

Input.displayName = "Input";

export { Input };
