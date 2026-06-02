import type { ReactNode } from "react";

type AdminDataTableProps = {
  children: ReactNode;
  label?: string;
};

export function AdminDataTable({
  children,
  label = "Data table",
}: AdminDataTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div
        className="overflow-x-auto overscroll-x-contain"
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
