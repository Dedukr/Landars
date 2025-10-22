import React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      fullWidth = false,
      id,
      ...props
    },
    ref
  ) => {
    const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;

    const baseStyles = [
      // Base textarea styles
      "flex w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--card-bg)] px-3 py-2 text-sm",
      "text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]",
      "focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "transition-colors duration-200",
      "resize-vertical min-h-[100px]",
    ];

    const widthStyles = fullWidth ? "w-full" : "";

    const errorStyles = error
      ? [
          "border-[var(--destructive)] focus:ring-[var(--destructive)]",
          "focus:border-[var(--destructive)]",
        ]
      : [];

    const textareaElement = (
      <textarea
        className={cn(
          baseStyles,
          widthStyles,
          errorStyles,
          className
        )}
        ref={ref}
        id={textareaId}
        {...props}
      />
    );

    if (label || error || helperText) {
      return (
        <div className={cn("space-y-2", fullWidth ? "w-full" : "")}>
          {label && (
            <label
              htmlFor={textareaId}
              className="text-sm font-medium text-[var(--foreground)]"
            >
              {label}
            </label>
          )}
          {textareaElement}
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

    return textareaElement;
  }
);

Textarea.displayName = "Textarea";

export { Textarea };
