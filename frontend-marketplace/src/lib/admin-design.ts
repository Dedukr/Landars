/**
 * Shared admin panel design tokens (section 2.15).
 * Use these across shell, layout, and reusable admin components.
 */
export const adminDesign = {
  pagePadding: "px-4 py-4 sm:px-6 lg:px-8",
  pageSection: "space-y-6",
  card: "rounded-xl border bg-card p-5 shadow-sm",
  pageTitle: "text-2xl font-semibold tracking-tight",
  cardTitle: "text-base font-semibold",
  description: "text-sm text-muted-foreground",
  smallLabel: "text-xs font-medium uppercase tracking-wide text-muted-foreground",
} as const;
