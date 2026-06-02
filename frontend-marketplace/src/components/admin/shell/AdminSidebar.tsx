"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { adminNavGroups } from "@/components/admin/navigation/admin-nav-items";
import { AdminNavGroup } from "@/components/admin/navigation/AdminNavGroup";
import { filterAdminNavGroups } from "@/components/admin/navigation/filter-admin-nav-items";
import { Button } from "@/components/admin/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

type AdminSidebarProps = {
  collapsed: boolean;
  onCollapsedChange: (value: boolean) => void;
  className?: string;
};

export function AdminSidebar({
  collapsed,
  onCollapsedChange,
  className,
}: AdminSidebarProps) {
  const { user } = useAuth();
  const groups = filterAdminNavGroups(adminNavGroups, {
    is_staff: Boolean(user?.is_staff),
    is_superuser: Boolean(user?.is_superuser),
  });

  return (
    <aside
      className={cn(
        "hidden border-r bg-card transition-all duration-200 lg:flex lg:flex-col",
        collapsed ? "lg:w-20" : "lg:w-72",
        className
      )}
    >
      <div className="flex h-16 items-center justify-between border-b px-4">
        {!collapsed ? (
          <div>
            <p className="text-sm font-semibold">LandarsFood</p>
            <p className="text-xs text-muted-foreground">Admin Panel</p>
          </div>
        ) : null}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => onCollapsedChange(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto p-4">
        {groups.map((group) => (
          <AdminNavGroup key={group.label} group={group} collapsed={collapsed} />
        ))}
      </nav>
    </aside>
  );
}
