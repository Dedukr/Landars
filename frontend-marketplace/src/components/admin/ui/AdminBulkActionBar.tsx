import type { ReactNode } from "react";

type AdminBulkActionBarProps = {
  selectedCount: number;
  actions?: ReactNode;
};

export function AdminBulkActionBar({
  selectedCount,
  actions,
}: AdminBulkActionBarProps) {
  if (selectedCount <= 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-medium">
        {selectedCount} item{selectedCount === 1 ? "" : "s"} selected
      </p>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
