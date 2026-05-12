"use client";

function SkeletonBlock({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`animate-pulse rounded-lg ${className ?? ""}`}
      style={{ background: "var(--sidebar-bg)", ...style }}
      aria-hidden="true"
    />
  );
}

function CartItemSkeleton() {
  return (
    <div
      className="p-4 sm:p-5"
      style={{ borderBottom: "1px solid var(--sidebar-border)" }}
    >
      <div className="flex gap-3 sm:gap-4">
        {/* Image skeleton */}
        <SkeletonBlock className="w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] shrink-0 rounded-xl" />

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex justify-between gap-2">
            <div className="flex-1 space-y-1.5">
              <SkeletonBlock className="h-4 w-3/4" />
              <SkeletonBlock className="h-3 w-1/3" />
            </div>
            <SkeletonBlock className="h-5 w-14 shrink-0" />
          </div>
          <div className="flex items-center justify-between mt-3">
            <SkeletonBlock className="h-9 w-28 rounded-xl" />
            <div className="flex gap-1">
              <SkeletonBlock className="h-8 w-16 rounded-lg" />
              <SkeletonBlock className="h-8 w-20 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CartLoadingState() {
  return (
    <div
      className="lg:grid lg:grid-cols-12 lg:gap-x-8 lg:items-start"
      aria-busy="true"
      aria-label="Loading your basket"
    >
      {/* Items skeleton */}
      <div className="lg:col-span-8">
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--sidebar-border)",
          }}
        >
          {/* Header skeleton */}
          <div
            className="flex items-center gap-2 px-5 py-4"
            style={{ borderBottom: "1px solid var(--sidebar-border)" }}
          >
            <SkeletonBlock className="w-4 h-4 rounded" />
            <SkeletonBlock className="h-4 w-24" />
          </div>
          <CartItemSkeleton />
          <CartItemSkeleton />
          <CartItemSkeleton />
        </div>
      </div>

      {/* Summary skeleton */}
      <div className="mt-6 lg:mt-0 lg:col-span-4">
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--sidebar-border)",
          }}
        >
          <div
            className="px-5 py-4"
            style={{ borderBottom: "1px solid var(--sidebar-border)" }}
          >
            <SkeletonBlock className="h-4 w-32" />
          </div>
          <div className="p-5 space-y-3">
            <SkeletonBlock className="h-16 w-full rounded-xl" />
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="h-px w-full" />
            <SkeletonBlock className="h-5 w-full" />
            <SkeletonBlock className="h-12 w-full rounded-xl" />
            <SkeletonBlock className="h-10 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
