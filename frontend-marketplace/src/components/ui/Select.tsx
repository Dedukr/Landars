import React from "react";
import { cn } from "@/lib/utils";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  options: { value: string; label: string }[];
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      fullWidth = false,
      options,
      id,
      ...props
    },
    ref
  ) => {
    const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;

    const baseStyles = [
      // Base select styles
      "flex w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--card-bg)] px-3 py-2 text-sm",
      "text-[var(--foreground)]",
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

    const selectElement = (
      <select
        className={cn(baseStyles, widthStyles, errorStyles, className)}
        ref={ref}
        id={selectId}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );

    if (label || error || helperText) {
      return (
        <div className={cn("space-y-2", fullWidth ? "w-full" : "")}>
          {label && (
            <label
              htmlFor={selectId}
              className="text-sm font-medium text-[var(--foreground)]"
            >
              {label}
            </label>
          )}
          {selectElement}
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

    return selectElement;
  }
);

Select.displayName = "Select";

export { Select };
