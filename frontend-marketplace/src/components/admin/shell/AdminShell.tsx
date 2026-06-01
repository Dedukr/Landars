import type { ReactNode } from "react";

import { TooltipProvider } from "@/components/admin/ui/tooltip";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";

type AdminShellProps = {
  children: ReactNode;
};

export function AdminShell({ children }: AdminShellProps) {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <div className="flex min-h-screen">
          <AdminSidebar className="hidden md:block" />
          <main className="flex-1">
            <AdminTopbar />
            <div className="p-6">{children}</div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
