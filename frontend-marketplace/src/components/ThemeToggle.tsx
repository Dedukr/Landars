"use client";

import React from "react";
import { useTheme } from "@/contexts/ThemeContext";

interface ThemeToggleProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export default function ThemeToggle({
  className = "",
  size = "md",
  showLabel = false,
}: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();

  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
  };

  const iconSizes = {
    sm: 16,
    md: 20,
    lg: 24,
  };

  const iconSize = iconSizes[size];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showLabel && (
        <span
          className="text-sm font-medium"
          style={{ color: "var(--foreground)" }}
        >
          {resolvedTheme === "light" ? "Light" : "Dark"}
        </span>
      )}

      <button
        onClick={toggleTheme}
        className={`
          ${sizeClasses[size]}
          relative rounded-full p-2
          transition-all duration-300 ease-in-out
          hover:scale-105 active:scale-95
          focus:outline-none focus:ring-2 focus:ring-offset-2
          group
        `}
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--sidebar-border)",
          color: "var(--foreground)",
          boxShadow: "var(--card-shadow)",
        }}
        aria-label={`Switch to ${
          resolvedTheme === "light" ? "dark" : "light"
        } theme`}
        title={`Switch to ${
          resolvedTheme === "light" ? "dark" : "light"
        } theme`}
      >
        {/* Sun Icon */}
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`
            absolute inset-0 m-auto transition-all duration-500 ease-in-out
            ${
              resolvedTheme === "light"
                ? "opacity-100 rotate-0 scale-100"
                : "opacity-0 rotate-90 scale-75"
            }
          `}
        >
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>

        {/* Moon Icon */}
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`
            absolute inset-0 m-auto transition-all duration-500 ease-in-out
            ${
              resolvedTheme === "dark"
                ? "opacity-100 rotate-0 scale-100"
                : "opacity-0 -rotate-90 scale-75"
            }
          `}
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>

        {/* Hover effect overlay */}
        <div
          className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-10 transition-opacity duration-200"
          style={{ background: "var(--primary)" }}
        />
      </button>
    </div>
  );
}

// Alternative compact toggle for mobile
export function CompactThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`
        relative w-8 h-8 rounded-full p-1.5
        transition-all duration-300 ease-in-out
        hover:scale-105 active:scale-95
        focus:outline-none focus:ring-2 focus:ring-offset-1
        group ${className}
      `}
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--sidebar-border)",
        color: "var(--foreground)",
      }}
      aria-label={`Switch to ${
        resolvedTheme === "light" ? "dark" : "light"
      } theme`}
      title={`Switch to ${resolvedTheme === "light" ? "dark" : "light"} theme`}
    >
      {/* Sun Icon */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`
          absolute inset-0 m-auto transition-all duration-500 ease-in-out
          ${
            resolvedTheme === "light"
              ? "opacity-100 rotate-0 scale-100"
              : "opacity-0 rotate-90 scale-75"
          }
        `}
      >
        <circle cx="12" cy="12" r="5" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>

      {/* Moon Icon */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`
          absolute inset-0 m-auto transition-all duration-500 ease-in-out
          ${
            resolvedTheme === "dark"
              ? "opacity-100 rotate-0 scale-100"
              : "opacity-0 -rotate-90 scale-75"
          }
        `}
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
}
