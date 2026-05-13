"use client";

import { OrderSectionCard } from "./OrderSectionCard";
import { cn } from "@/lib/utils";

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md", className)}
      style={{ background: "var(--sidebar-border)", opacity: 0.45 }}
      aria-hidden
    />
  );
}

export function OrderDetailsSkeleton() {
  return (
    <div className="min-h-screen pb-28" style={{ background: "var(--background)" }}>

      <div className="mx-auto max-w-6xl px-4 pb-8 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <div
          className="mb-6 overflow-hidden rounded-2xl border sm:rounded-3xl"
          style={{
            background: "var(--card-bg)",
            borderColor: "var(--sidebar-border)",
            boxShadow: "var(--card-shadow)",
          }}
        >
          <Shimmer className="h-1.5 w-full rounded-none sm:h-2" />
          <div
            className="border-b px-4 py-3 sm:px-5"
            style={{ borderColor: "var(--sidebar-border)" }}
          >
            <Shimmer className="h-5 w-[min(100%,18rem)] rounded-md" />
          </div>
          <div className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Shimmer className="h-5 w-28 rounded-lg" />
              <Shimmer className="h-12 w-full rounded-xl sm:max-w-[12.5rem]" />
            </div>
            <Shimmer className="mt-5 h-9 w-full max-w-[12rem] rounded-lg sm:max-w-xs" />
            <div className="mt-3 flex flex-wrap gap-2">
              <Shimmer className="h-9 w-24 rounded-full" />
              <Shimmer className="h-9 w-32 rounded-full" />
            </div>
            <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:justify-between">
              <div className="flex gap-4">
                <Shimmer className="h-16 w-16 shrink-0 rounded-2xl" />
                <div className="min-w-0 flex-1 space-y-2 pt-1">
                  <Shimmer className="h-3 w-24 rounded-md" />
                  <Shimmer className="h-8 w-full max-w-[14rem] rounded-lg" />
                  <Shimmer className="h-4 w-full max-w-sm rounded-md" />
                </div>
              </div>
              <Shimmer className="h-44 w-full rounded-2xl sm:max-w-md lg:max-w-xs" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:gap-8 lg:items-start">
          <div className="space-y-6 lg:col-span-7 xl:col-span-8">
            <OrderSectionCard>
              <Shimmer className="mb-4 h-6 w-32 rounded-md" />
              <div className="space-y-4">
                {[1, 2, 3].map((k) => (
                  <div
                    key={k}
                    className="flex gap-4 border-b border-[var(--sidebar-border)] pb-4 last:border-0 last:pb-0"
                  >
                    <Shimmer className="h-20 w-20 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Shimmer className="h-4 max-w-sm rounded-md sm:w-[min(100%,20rem)]" />
                      <Shimmer className="h-3 w-24 rounded-md" />
                      <Shimmer className="h-3 w-40 rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
            </OrderSectionCard>
            <OrderSectionCard>
              <Shimmer className="mb-4 h-6 w-48 rounded-md" />
              <div className="space-y-3">
                <Shimmer className="h-4 w-full rounded-md" />
                <Shimmer className="h-4 w-full rounded-md" />
                <Shimmer className="h-4 w-2/3 rounded-md" />
              </div>
            </OrderSectionCard>
          </div>
          <div className="lg:col-span-5 xl:col-span-4">
            <OrderSectionCard className="lg:sticky lg:top-6">
              <Shimmer className="mb-4 h-6 w-36 rounded-md" />
              <div className="space-y-3">
                <Shimmer className="h-4 w-full rounded-md" />
                <Shimmer className="h-4 w-full rounded-md" />
                <Shimmer className="h-10 w-full rounded-lg" />
              </div>
            </OrderSectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
