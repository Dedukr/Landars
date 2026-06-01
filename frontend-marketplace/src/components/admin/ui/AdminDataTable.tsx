import type { ReactNode } from "react";

type AdminDataTableProps = {
  children: ReactNode;
};

export function AdminDataTable({ children }: AdminDataTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
