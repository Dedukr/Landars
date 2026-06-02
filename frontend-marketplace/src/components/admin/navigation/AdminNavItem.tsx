"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { adminA11y } from "@/lib/admin-a11y";
import { cn } from "@/lib/utils";

import type { AdminNavItem as AdminNavItemConfig } from "./admin-nav-items";
import { isAdminNavItemActive } from "./is-admin-nav-item-active";

type AdminNavItemProps = {
  item: AdminNavItemConfig;
  collapsed?: boolean;
  onNavigate?: () => void;
};

export function AdminNavItem({
  item,
  collapsed = false,
  onNavigate,
}: AdminNavItemProps) {
  const pathname = usePathname();
  const isActive = isAdminNavItemActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        adminA11y.focusRingOffset,
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        collapsed ? "justify-center" : "",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />

      {!collapsed ? (
        <>
          <span className="flex-1">{item.label}</span>
          {item.badge !== undefined ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {item.badge}
            </span>
          ) : null}
        </>
      ) : null}
    </Link>
  );
}
