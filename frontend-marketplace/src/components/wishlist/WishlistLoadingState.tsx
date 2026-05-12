"use client";

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg ${className ?? ""}`}
      style={{ background: "var(--sidebar-bg)" }}
      aria-hidden="true"
    />
  );
}

function WishlistCardSkeleton() {
  return (
    <div
      className="rounded-2xl border overflow-hidden flex flex-col"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
      }}
    >
      <SkeletonBlock className="aspect-[4/3] w-full rounded-none" />
      <div className="p-4 space-y-3 flex-1 flex flex-col">
        <SkeletonBlock className="h-4 w-[85%]" />
        <SkeletonBlock className="h-3 w-[66%]" />
        <SkeletonBlock className="h-6 w-24 mt-auto" />
        <SkeletonBlock className="h-11 w-full rounded-xl mt-2" />
      </div>
    </div>
  );
}

export default function WishlistLoadingState() {
  return (
    <div aria-busy="true" aria-label="Loading your wishlist items">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
        <WishlistCardSkeleton />
        <WishlistCardSkeleton />
        <WishlistCardSkeleton />
        <div className="hidden xl:block">
          <WishlistCardSkeleton />
        </div>
      </div>
    </div>
  );
}
