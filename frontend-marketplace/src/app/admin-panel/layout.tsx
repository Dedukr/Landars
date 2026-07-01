"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { MessageSquare, LayoutDashboard, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const NAV_ITEMS = [
  { label: "Reviews", href: "/admin-panel/reviews", icon: MessageSquare },
  // Future items — uncomment when pages are built:
  // { label: "Orders",   href: "/admin-panel/orders",  icon: ShoppingBag },
  // { label: "Products", href: "/admin-panel/products", icon: Package },
];

function NavItem({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-[var(--primary)]/10 text-[var(--primary)]"
          : "text-[var(--muted-foreground)] hover:bg-[var(--sidebar-border)]/40 hover:text-[var(--foreground)]",
      ].join(" ")}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}

export default function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && (!user || !user.is_staff)) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-[var(--muted-foreground)]">
        Loading…
      </div>
    );
  }

  if (!user?.is_staff) {
    return null;
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)]">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-52 shrink-0 border-r border-[var(--sidebar-border)] bg-[var(--card-bg)] py-6 px-2 flex flex-col gap-6">
        {/* Brand */}
        <div className="px-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
            <LayoutDashboard className="h-4 w-4 text-[var(--primary)]" />
            Admin Panel
          </div>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            {user.email}
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-0.5">
          <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Content
          </p>
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={pathname.startsWith(item.href)}
            />
          ))}
        </nav>

        {/* Bottom link to Django admin */}
        <div className="mt-auto px-3">
          <a
            href="/admin/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Django admin
          </a>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto bg-[var(--background)] p-6">
        {children}
      </main>
    </div>
  );
}
