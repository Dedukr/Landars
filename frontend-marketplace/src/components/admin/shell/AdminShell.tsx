"use client";

import { ReactNode, useState } from "react";

import { adminA11y } from "@/lib/admin-a11y";
import { adminDesign } from "@/lib/admin-design";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/admin/ui/tooltip";
import { AdminMobileSidebar } from "./AdminMobileSidebar";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";

type AdminShellProps = {
  children: ReactNode;
};

export function AdminShell({ children }: AdminShellProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] =
    useState(false);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <a href="#admin-main-content" className={adminA11y.skipLink}>
          Skip to main content
        </a>
        <AdminMobileSidebar
          open={isMobileSidebarOpen}
          onOpenChange={setIsMobileSidebarOpen}
        />

        <div className="flex min-h-screen">
          <AdminSidebar
            collapsed={isDesktopSidebarCollapsed}
            onCollapsedChange={setIsDesktopSidebarCollapsed}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            <AdminTopbar
              isMobileMenuOpen={isMobileSidebarOpen}
              isDesktopSidebarCollapsed={isDesktopSidebarCollapsed}
              onMobileMenuClick={() => setIsMobileSidebarOpen(true)}
              onDesktopSidebarToggle={() =>
                setIsDesktopSidebarCollapsed((value) => !value)
              }
            />

            <main
              id="admin-main-content"
              className={cn("flex-1", adminDesign.pagePadding)}
            >
              <div className={adminDesign.pageSection}>{children}</div>
            </main>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
