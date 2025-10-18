import React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "secondary"
    | "outline"
    | "ghost"
    | "destructive"
    | "success";
  size?: "sm" | "md" | "lg" | "xl";
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      icon,
      iconPosition = "left",
      fullWidth = false,
      asChild = false,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles = [
      // Base button styles
      "inline-flex items-center justify-center gap-2",
      "font-semibold transition-all duration-200",
      "focus:outline-none focus:ring-2 focus:ring-offset-2",
      "disabled:opacity-50 disabled:cursor-not-allowed",
      "relative overflow-hidden",
      // Ensure minimum touch target for mobile
      "min-h-[44px] min-w-[44px]",
    ];

    const sizeStyles = {
      sm: "px-3 py-1.5 text-sm rounded-md min-h-[36px]",
      md: "px-4 py-2 text-sm rounded-lg min-h-[44px]",
      lg: "px-6 py-3 text-base rounded-lg min-h-[48px]",
      xl: "px-8 py-4 text-lg rounded-xl min-h-[56px]",
    };

    const variantStyles = {
      primary: [
        "bg-[var(--primary)] text-white",
        "hover:bg-[var(--primary-hover)]",
        "focus:ring-[var(--primary)]",
        "shadow-sm hover:shadow-md",
        "active:scale-[0.98]",
      ],
      secondary: [
        "bg-[var(--accent)] text-white",
        "hover:bg-[#c8953a]",
        "focus:ring-[var(--accent)]",
        "shadow-sm hover:shadow-md",
        "active:scale-[0.98]",
      ],
      outline: [
        "border-2 border-[var(--primary)] text-[var(--primary)] bg-transparent",
        "hover:bg-[var(--primary)] hover:text-white",
        "focus:ring-[var(--primary)]",
        "active:scale-[0.98]",
      ],
      ghost: [
        "text-[var(--primary)] bg-transparent",
        "hover:bg-[var(--primary)]/10",
        "focus:ring-[var(--primary)]",
        "active:scale-[0.98]",
      ],
      destructive: [
        "text-white",
        "shadow-sm hover:shadow-md",
        "active:scale-[0.98]",
      ],
      success: [
        "text-white",
        "shadow-sm hover:shadow-md",
        "active:scale-[0.98]",
      ],
    };

    const widthStyles = fullWidth ? "w-full" : "";

    const LoadingSpinner = () => (
      <svg
        className="animate-spin h-4 w-4"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    );

    const buttonContent = (
      <>
        {loading && <LoadingSpinner />}
        {!loading && icon && iconPosition === "left" && (
          <span className="flex-shrink-0">{icon}</span>
        )}
        {children && (
          <span className={loading ? "opacity-0" : ""}>{children}</span>
        )}
        {!loading && icon && iconPosition === "right" && (
          <span className="flex-shrink-0">{icon}</span>
        )}
      </>
    );

    if (asChild && React.isValidElement(children)) {
      const childElement = children as React.ReactElement<
        React.HTMLAttributes<HTMLElement>
      >;
      return React.cloneElement(
        childElement,
        {
          className: cn(
            baseStyles,
            sizeStyles[size],
            variantStyles[variant],
            widthStyles,
            className,
            childElement.props.className
          ),
          ...(disabled || loading ? { "aria-disabled": true } : {}),
        } as Partial<React.HTMLAttributes<HTMLElement>>,
        buttonContent
      );
    }

    // Get dynamic styles for destructive and success variants
    const getVariantStyles = () => {
      if (variant === "destructive") {
        return {
          background: "var(--destructive)",
          "--hover-bg": "rgba(220, 38, 38, 0.8)",
          "--focus-ring": "var(--destructive)",
        };
      }
      if (variant === "success") {
        return {
          background: "var(--success)",
          "--hover-bg": "rgba(22, 163, 74, 0.8)",
          "--focus-ring": "var(--success)",
        };
      }
      return {};
    };

    return (
      <button
        className={cn(
          baseStyles,
          sizeStyles[size],
          variantStyles[variant],
          widthStyles,
          className
        )}
        style={getVariantStyles()}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {buttonContent}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
