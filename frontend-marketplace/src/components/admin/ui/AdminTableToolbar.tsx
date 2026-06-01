import type { ReactNode } from "react";

type AdminTableToolbarProps = {
  left?: ReactNode;
  right?: ReactNode;
};

export function AdminTableToolbar({ left, right }: AdminTableToolbarProps) {
  return (
    <div className="flex flex-col gap-3 pb-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2">{left}</div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}
