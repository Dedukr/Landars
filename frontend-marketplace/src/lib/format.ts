/**
 * Shared formatting utilities for the admin dashboard.
 *
 * A thin complement to lib/formatPrice.ts which is used by the marketplace.
 * Import from here in dashboard components.
 */

// ─── Money ────────────────────────────────────────────────────────────────────

/**
 * Format a numeric or string value as GBP currency.
 * Returns "£0.00" for null / undefined / empty / NaN.
 */
export function formatCurrency(value: string | number | null | undefined): string {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "£0.00";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(numeric);
}

// ─── Dates ────────────────────────────────────────────────────────────────────

/**
 * Format an ISO datetime string as a British medium date + short time.
 * Example: "3 Jun 2026, 14:10"
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/**
 * Compact date label suitable for chart X-axes.
 * Example: "03 Jun"
 */
export function formatShortDate(value: string | null | undefined): string {
  if (!value) return "";
  // Append time so Date() doesn't shift the date in UTC-only environments.
  const d = new Date(value.includes("T") ? value : value + "T00:00:00");
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(d);
}

// ─── Status display ───────────────────────────────────────────────────────────

/**
 * Convert a snake_case status value to a human-readable title-case label.
 * Example: "label_ready" → "Label Ready"
 */
export function humanizeStatus(status: string): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
