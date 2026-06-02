import { AdminNavItem } from "./AdminNavItem";
import type { AdminNavGroup as AdminNavGroupType } from "./admin-nav-items";

import { adminDesign } from "@/lib/admin-design";

type AdminNavGroupProps = {
  group: AdminNavGroupType;
  collapsed?: boolean;
  onNavigate?: () => void;
};

export function AdminNavGroup({
  group,
  collapsed = false,
  onNavigate,
}: AdminNavGroupProps) {
  return (
    <div>
      {!collapsed ? (
        <p className={`mb-2 px-2 ${adminDesign.smallLabel}`}>
          {group.label}
        </p>
      ) : null}

      <div className="space-y-1">
        {group.items.map((item) => (
          <AdminNavItem
            key={item.href}
            item={item}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}
