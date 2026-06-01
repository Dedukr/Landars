"use client";

import { cn } from "@/lib/utils";
import { adminNavGroups } from "@/components/admin/navigation/admin-nav-items";
import { AdminNavGroup } from "@/components/admin/navigation/AdminNavGroup";
import { useAuth } from "@/contexts/AuthContext";

type AdminSidebarProps = {
  isSuperuser?: boolean;
  className?: string;
};

export function AdminSidebar({
  isSuperuser,
  className,
}: AdminSidebarProps) {
  const { user } = useAuth();
  const effectiveSuperuser = isSuperuser ?? Boolean(user?.is_superuser);

  const groups = adminNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => item.permission !== "superuser" || effectiveSuperuser
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside className={cn("w-64 border-r bg-card p-4", className)}>
      <div className="mb-6">
        <h1 className="text-lg font-semibold">LandarsFood</h1>
        <p className="text-sm text-muted-foreground">Admin Panel</p>
      </div>
      <nav className="space-y-4">
        {groups.map((group) => (
          <AdminNavGroup key={group.label} group={group} />
        ))}
      </nav>
    </aside>
  );
}
