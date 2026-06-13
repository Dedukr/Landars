"use client";

import Link from "next/link";
import { ClipboardList, ShoppingBag } from "lucide-react";

/**
 * Sticky bottom bar: navigation only (no new actions). Safe-area aware for notched phones.
 */
export function MobileOrderDetailsBar() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:hidden"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        boxShadow: "0 -8px 24px rgba(0,0,0,0.08)",
      }}
    >
      <div className="mx-auto flex max-w-lg gap-2 px-4">
        <Link
          href="/orders"
          className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
          style={{
            borderColor: "var(--sidebar-border)",
            color: "var(--foreground)",
            background: "var(--sidebar-bg)",
          }}
        >
          <ClipboardList className="h-4 w-4 shrink-0" aria-hidden />
          Orders
        </Link>
        <Link
          href="/shop"
          className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
          style={{ background: "var(--btn-primary)" }}
        >
          <ShoppingBag className="h-4 w-4 shrink-0" aria-hidden />
          Shop
        </Link>
      </div>
    </div>
  );
}
