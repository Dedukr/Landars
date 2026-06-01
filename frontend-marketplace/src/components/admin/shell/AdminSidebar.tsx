"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/admin/ui/button";
import { cn } from "@/lib/utils";
import { adminNavGroups } from "@/components/admin/navigation/admin-nav-items";
import { useAuth } from "@/contexts/AuthContext";

type AdminSidebarProps = {
  collapsed: boolean;
  onCollapsedChange: (value: boolean) => void;
  isSuperuser?: boolean;
  className?: string;
};

export function AdminSidebar({
  collapsed,
  onCollapsedChange,
  isSuperuser,
  className,
}: AdminSidebarProps) {
  const { user } = useAuth();
  const pathname = usePathname();
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
          <div key={group.label}>
            {!collapsed ? (
              <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
            ) : null}

            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" &&
                    pathname.startsWith(`${item.href}/`));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      collapsed ? "justify-center" : "",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    aria-label={collapsed ? item.label : undefined}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" />

                    {!collapsed ? (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {item.badge ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {item.badge}
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
