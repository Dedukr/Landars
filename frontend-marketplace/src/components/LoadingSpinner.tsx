import React from "react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
}

const sizeMap = {
  sm: "w-5 h-5",
  md: "w-8 h-8",
  lg: "w-12 h-12",
};

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "md",
  text = "Loading…",
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center min-h-[200px] gap-3 ${className}`}
    >
      <div className={`${sizeMap[size]} animate-spin flex-shrink-0`}>
        <svg
          className="w-full h-full"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-20"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            style={{ color: "var(--primary)" }}
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            style={{ color: "var(--accent)" }}
          />
        </svg>
      </div>
      {text && (
        <p className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
          {text}
        </p>
      )}
    </div>
  );
};

export default LoadingSpinner;
