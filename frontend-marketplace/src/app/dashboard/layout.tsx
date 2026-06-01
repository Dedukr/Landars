import type { ReactNode } from "react";

import { AdminGuard } from "@/components/dashboard/AdminGuard";
import { AdminShell } from "@/components/admin/shell/AdminShell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGuard>
      <AdminShell>{children}</AdminShell>
    </AdminGuard>
  );
}
