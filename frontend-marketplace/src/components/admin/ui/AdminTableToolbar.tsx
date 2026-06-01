import type { ReactNode } from "react";

type AdminTableToolbarProps = {
  left?: ReactNode;
  right?: ReactNode;
};

export function AdminTableToolbar({ left, right }: AdminTableToolbarProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap gap-2">{left}</div>
      <div className="flex flex-wrap gap-2">{right}</div>
    </div>
  );
}
