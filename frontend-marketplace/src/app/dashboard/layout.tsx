import type { ReactNode } from "react";
import Link from "next/link";

import { AdminGuard } from "@/components/dashboard/AdminGuard";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/products", label: "Products" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/invoices", label: "Invoices" },
  { href: "/dashboard/credit-notes", label: "Credit Notes" },
  { href: "/dashboard/shipments", label: "Shipments" },
  { href: "/dashboard/reconciliation", label: "Reconciliation" },
  { href: "/dashboard/notifications", label: "Notifications" },
  { href: "/dashboard/reports", label: "Reports" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGuard>
      <div className="min-h-screen bg-background">
        <div className="flex min-h-screen">
          <aside className="hidden w-64 border-r bg-card p-4 md:block">
            <div className="mb-6">
              <h1 className="text-lg font-semibold">LandarsFood</h1>
              <p className="text-sm text-muted-foreground">Admin Panel</p>
            </div>
            <nav className="space-y-2">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="flex-1">
            <header className="border-b px-6 py-4">
              <h2 className="text-xl font-semibold">Dashboard</h2>
            </header>
            <div className="p-6">{children}</div>
          </main>
        </div>
      </div>
    </AdminGuard>
  );
}
