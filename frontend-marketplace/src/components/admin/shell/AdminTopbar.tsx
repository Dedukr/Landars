"use client";

import { Menu, PanelLeft } from "lucide-react";

import { Button } from "@/components/admin/ui/button";
import { AdminBreadcrumbs } from "./AdminBreadcrumbs";
import { AdminThemeToggle } from "./AdminThemeToggle";
import { AdminUserMenu } from "./AdminUserMenu";

type AdminTopbarProps = {
  onMobileMenuClick: () => void;
  onDesktopSidebarToggle: () => void;
};

export function AdminTopbar({
  onMobileMenuClick,
  onDesktopSidebarToggle,
}: AdminTopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMobileMenuClick}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="hidden lg:inline-flex"
        onClick={onDesktopSidebarToggle}
        aria-label="Toggle sidebar"
      >
        <PanelLeft className="h-5 w-5" />
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
