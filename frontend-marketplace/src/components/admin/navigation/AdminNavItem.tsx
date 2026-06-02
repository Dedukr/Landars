"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AdminNavItem as AdminNavItemConfig } from "./admin-nav-items";
import { cn } from "@/lib/utils";

type AdminNavItemProps = {
  item: AdminNavItemConfig;
};

export function AdminNavItem({ item }: AdminNavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-foreground hover:bg-muted"
      )}
    >
      <span className="flex items-center gap-2">
        <Icon className="size-4" />
        <span>{item.label}</span>
      </span>
      {item.badge !== undefined ? (
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}
