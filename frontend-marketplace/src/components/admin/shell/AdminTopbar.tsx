"use client";

import { useAuth } from "@/contexts/AuthContext";
import { AdminBreadcrumbs } from "./AdminBreadcrumbs";
import { AdminMobileSidebar } from "./AdminMobileSidebar";
import { AdminThemeToggle } from "./AdminThemeToggle";
import { AdminUserMenu } from "./AdminUserMenu";

export function AdminTopbar() {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="md:hidden">
            <AdminMobileSidebar isSuperuser={Boolean(user?.is_superuser)} />
          </div>
          <AdminBreadcrumbs />
        </div>
        <div className="flex items-center gap-2">
          <AdminThemeToggle />
          <AdminUserMenu />
        </div>
      </div>
    </header>
  );
}
