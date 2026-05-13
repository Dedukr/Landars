"use client";

import { cn } from "@/lib/utils";

export function OrderSectionCard({
  children,
  className,
  id,
  "aria-labelledby": labelledBy,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(
        "rounded-2xl border p-4 shadow-sm sm:rounded-3xl sm:p-6",
        className
      )}
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      {children}
    </section>
  );
}
