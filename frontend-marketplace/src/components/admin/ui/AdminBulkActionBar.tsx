import type { ReactNode } from "react";

type AdminBulkActionBarProps = {
  selectedCount: number;
  actions: ReactNode;
};

export function AdminBulkActionBar({
  selectedCount,
  actions,
}: AdminBulkActionBarProps) {
  if (selectedCount <= 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3 md:flex-row md:items-center md:justify-between">
      <p className="text-sm text-muted-foreground">
        {selectedCount} selected
      </p>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}
