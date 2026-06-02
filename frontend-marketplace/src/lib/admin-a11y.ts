/**
 * Shared admin accessibility utilities (section 2.16).
 */
export const adminA11y = {
  focusRing:
    "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  focusRingOffset:
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  skipLink:
    "sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-sm",
} as const;
