import { AdminNavItem } from "./AdminNavItem";
import type { AdminNavGroup as AdminNavGroupType } from "./admin-nav-items";

type AdminNavGroupProps = {
  group: AdminNavGroupType;
};

export function AdminNavGroup({ group }: AdminNavGroupProps) {
  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {group.label}
      </p>
      <div className="space-y-1">
        {group.items.map((item) => (
          <AdminNavItem key={item.href} item={item} />
        ))}
      </div>
    </div>
  );
}
