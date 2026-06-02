"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { adminNavGroups } from "@/components/admin/navigation/admin-nav-items";
import { filterAdminNavGroups } from "@/components/admin/navigation/filter-admin-nav-items";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent } from "@/components/admin/ui/sheet";

type AdminMobileSidebarProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AdminMobileSidebar({
  open,
  onOpenChange,
}: AdminMobileSidebarProps) {
  const { user } = useAuth();
  const pathname = usePathname();

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
            <div key={group.label}>
              <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>

              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => onOpenChange(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1">{item.label}</span>

                      {item.badge !== undefined ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
