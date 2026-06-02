"use client";

import { adminNavGroups } from "@/components/admin/navigation/admin-nav-items";
import { AdminNavGroup } from "@/components/admin/navigation/AdminNavGroup";
import { filterAdminNavGroups } from "@/components/admin/navigation/filter-admin-nav-items";
import { Sheet, SheetContent } from "@/components/admin/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";

type AdminMobileSidebarProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AdminMobileSidebar({
  open,
  onOpenChange,
}: AdminMobileSidebarProps) {
  const { user } = useAuth();

  const groups = filterAdminNavGroups(adminNavGroups, {
    is_staff: Boolean(user?.is_staff),
    is_superuser: Boolean(user?.is_superuser),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[18rem] p-0">
        <div className="border-b p-4">
          <p className="text-sm font-semibold">LandarsFood</p>
          <p className="text-xs text-muted-foreground">Admin Panel</p>
        </div>

        <nav className="space-y-6 overflow-y-auto p-4">
          {groups.map((group) => (
            <AdminNavGroup
              key={group.label}
              group={group}
              onNavigate={() => onOpenChange(false)}
            />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
