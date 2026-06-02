"use client";

import { Menu, PanelLeft } from "lucide-react";

import { Button } from "@/components/admin/ui/button";
import { AdminBreadcrumbs } from "./AdminBreadcrumbs";
import { AdminThemeToggle } from "./AdminThemeToggle";
import { AdminUserMenu } from "./AdminUserMenu";

type AdminTopbarProps = {
  onMobileMenuClick: () => void;
  onDesktopSidebarToggle: () => void;
  isMobileMenuOpen?: boolean;
  isDesktopSidebarCollapsed?: boolean;
};

export function AdminTopbar({
  onMobileMenuClick,
  onDesktopSidebarToggle,
  isMobileMenuOpen = false,
  isDesktopSidebarCollapsed = false,
}: AdminTopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        type="button"
        onClick={onMobileMenuClick}
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={isMobileMenuOpen}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="hidden lg:inline-flex"
        type="button"
        onClick={onDesktopSidebarToggle}
        aria-label={isDesktopSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!isDesktopSidebarCollapsed}
      >
        <PanelLeft className="h-5 w-5" aria-hidden="true" />
      </Button>

      <div className="min-w-0 flex-1">
        <AdminBreadcrumbs />
      </div>

      <div className="flex items-center gap-2">
        <AdminThemeToggle />
        <AdminUserMenu />
      </div>
    </header>
  );
}
