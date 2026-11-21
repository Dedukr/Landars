"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import type { HolidayEvent } from "@/lib/holidayApi";
import { FirBranch, Sparkles } from "@/components/holiday/SeasonArt";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Christmas / New Year orders get the festive variant. */
  holidayEvent?: HolidayEvent | null;
};

const FLAKES = 28;

export default function OrderThankYouModal({ open, onClose, holidayEvent = null }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      // Focus a safe action for keyboard users.
      closeButtonRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Order confirmation"
    >
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close"
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-lg overflow-hidden rounded-2xl shadow-xl${
          holidayEvent ? ` season-thanks season-thanks--${holidayEvent.theme}` : ""
        }`}
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--sidebar-border)",
        }}
      >
        {holidayEvent ? (
          <div className="season-thanks-sky" aria-hidden="true">
            {Array.from({ length: FLAKES }).map((_, i) => (
              <i
                key={i}
                style={{
                  left: `${(i * 53) % 100}%`,
                  animationDelay: `${(i * 0.41) % 3.2}s`,
                  animationDuration: `${3.6 + (i % 4) * 0.7}s`,
                }}
              />
            ))}
            {holidayEvent.theme === "christmas" ? (
              <FirBranch className="season-thanks-art" />
            ) : (
              <Sparkles className="season-thanks-art" />
            )}
          </div>
        ) : null}
        <div className="relative p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full"
                style={{
                  background: "var(--success-bg)",
                  border: "1px solid var(--success-border)",
                  color: "var(--success)",
                }}
                aria-hidden="true"
              >
                <svg
                  className="h-6 w-6"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <h2
                  className="text-xl sm:text-2xl font-bold"
                  style={{ color: "var(--foreground)" }}
                >
                  {holidayEvent
                    ? holidayEvent.theme === "christmas"
                      ? "Your Christmas feast is booked!"
                      : "Your New Year feast is booked!"
                    : "Thank you for your order!"}
                </h2>
                <p
                  className="mt-1 text-sm"
                  style={{ color: "var(--foreground)", opacity: 0.7 }}
                >
                  {holidayEvent
                    ? `We have received your ${holidayEvent.name} order and will contact you shortly to confirm your delivery day.`
                    : "We have received your order and will contact you shortly to confirm it."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 hover:bg-black/5"
              aria-label="Close"
              style={{ color: "var(--foreground)" }}
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          <p
            className="mt-4 text-sm sm:text-base"
            style={{ color: "var(--foreground)", opacity: 0.85 }}
          >
            {holidayEvent
              ? holidayEvent.theme === "christmas"
                ? "Merry Christmas from all of us at Landar’s Food 🎄"
                : "Happy New Year from all of us at Landar’s Food 🎆"
              : "Have a great day!"}
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              ref={closeButtonRef}
              onClick={onClose}
              variant="primary"
              fullWidth
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

