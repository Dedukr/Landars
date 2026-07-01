"use client";

import React, { useState, useRef } from "react";

const STAR_FILLED = "#f59e0b";
const STAR_EMPTY = "var(--sidebar-border)";

// ── Size map ──────────────────────────────────────────────────────────────────

const SIZE_MAP = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl",
  xl: "text-4xl",
} as const;

type StarSize = keyof typeof SIZE_MAP;

// ── StarDisplay ───────────────────────────────────────────────────────────────
// Read-only star row. Accepts fractional values — rounds for the coloured fill.

interface StarDisplayProps {
  value: number;
  size?: StarSize;
  className?: string;
}

export function StarDisplay({ value, size = "md", className }: StarDisplayProps) {
  const filled = Math.round(Math.min(5, Math.max(0, value)));
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${SIZE_MAP[size]} ${className ?? ""}`}
      aria-label={`${value.toFixed(1)} out of 5 stars`}
      role="img"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          style={{ color: i < filled ? STAR_FILLED : STAR_EMPTY }}
          aria-hidden
        >
          ★
        </span>
      ))}
    </span>
  );
}

// ── StarPicker ────────────────────────────────────────────────────────────────
// Interactive picker — keyboard-accessible via roving tabindex + arrow keys.
//
// Keyboard:
//   Tab          — enters / exits the widget as a single stop
//   ← / →        — move between stars and select them
//   Home / End   — jump to 1★ / 5★
//   Enter / Space — (also supported natively since each star is a <button>)

interface StarPickerProps {
  value: number;
  onChange: (rating: number) => void;
  size?: StarSize;
  disabled?: boolean;
  /** Optional id prefix for the radiogroup element */
  id?: string;
}

export function StarPicker({
  value,
  onChange,
  size = "lg",
  disabled = false,
  id,
}: StarPickerProps) {
  const [hovered, setHovered] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Roving tabindex: focused star gets 0, others get -1.
  // If nothing selected, star 1 is the entry point.
  const focusedIndex = value > 0 ? value : 1;
  const active = hovered || value;

  function moveFocus(newStar: number) {
    if (disabled) return;
    const clamped = Math.min(5, Math.max(1, newStar));
    onChange(clamped);
    // Move DOM focus to the corresponding button
    const btn = containerRef.current?.children[clamped - 1] as HTMLElement | undefined;
    btn?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent, star: number) {
    if (disabled) return;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        e.preventDefault();
        moveFocus(star + 1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        e.preventDefault();
        moveFocus(star - 1);
        break;
      case "Home":
        e.preventDefault();
        moveFocus(1);
        break;
      case "End":
        e.preventDefault();
        moveFocus(5);
        break;
    }
  }

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label="Star rating"
      aria-required="true"
      id={id}
      className="inline-flex gap-1"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star > 1 ? "s" : ""}`}
          // Roving tabindex — only the active star is in the tab sequence
          tabIndex={star === focusedIndex ? 0 : -1}
          disabled={disabled}
          onClick={() => !disabled && onChange(star)}
          onMouseEnter={() => !disabled && setHovered(star)}
          onMouseLeave={() => !disabled && setHovered(0)}
          onKeyDown={(e) => handleKeyDown(e, star)}
          className={[
            SIZE_MAP[size],
            // Clear visible focus ring for keyboard users (not mouse)
            "rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2",
            "transition-transform leading-none",
            disabled
              ? "cursor-not-allowed opacity-50"
              : "hover:scale-110 cursor-pointer",
          ].join(" ")}
          style={{
            color: star <= active ? STAR_FILLED : STAR_EMPTY,
            padding: "2px 3px",
            background: "none",
            border: "none",
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}
