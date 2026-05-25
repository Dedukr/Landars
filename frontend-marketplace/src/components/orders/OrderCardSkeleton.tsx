"use client";

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg ${className ?? ""}`}
      style={{ background: "var(--sidebar-bg)" }}
      aria-hidden
    />
  );
}

export function OrderCardSkeleton() {
  return (
    <div
      className="rounded-2xl border p-4 sm:p-5"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <Shimmer className="h-5 w-28" />
        <Shimmer className="h-6 w-20 rounded-full" />
      </div>
      <div className="mt-3 flex justify-between gap-4">
        <Shimmer className="h-4 w-24" />
        <Shimmer className="h-5 w-16" />
      </div>
      <Shimmer className="mt-4 h-4 w-full max-w-md" />
      <Shimmer className="mt-2 h-4 w-4/5" />
      <div className="mt-5 flex items-center justify-between gap-3">
        <Shimmer className="h-4 w-20" />
        <Shimmer className="h-11 w-full max-w-[9rem] rounded-xl sm:w-36" />
      </div>
    </div>
  );
}

export default function OrdersLoadingState() {
  return (
    <div aria-busy="true" aria-label="Loading your orders" className="space-y-4">
      <OrderCardSkeleton />
      <OrderCardSkeleton />
      <OrderCardSkeleton />
    </div>
  );
}
