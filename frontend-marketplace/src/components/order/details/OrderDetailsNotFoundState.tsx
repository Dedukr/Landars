"use client";

import Link from "next/link";
import { PackageX } from "lucide-react";
import { cn } from "@/lib/utils";

const linkPrimary =
  "inline-flex min-h-[48px] w-full items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[var(--primary-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 focus:ring-offset-[var(--card-bg)] sm:w-auto";

const linkOutline =
  "inline-flex min-h-[48px] w-full items-center justify-center rounded-lg border-2 border-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary)] transition-all hover:bg-[var(--primary)] hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 focus:ring-offset-[var(--card-bg)] sm:w-auto";

export function OrderDetailsNotFoundState() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 pb-28 pt-12"
      style={{ background: "var(--background)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 text-center sm:p-8"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: "var(--sidebar-bg)" }}
        >
          <PackageX
            className="h-7 w-7"
            style={{ color: "var(--muted-foreground)" }}
            aria-hidden
          />
        </div>
        <h1 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>
          We couldn&apos;t find this order
        </h1>
        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: "var(--muted-foreground)" }}
        >
          This order may no longer be available, or you may not have permission to
          view it.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/shop" className={cn(linkPrimary)}>
            Back to shop
          </Link>
          <Link href="/orders" className={cn(linkOutline)}>
            My orders
          </Link>
        </div>
      </div>
    </div>
  );
}
