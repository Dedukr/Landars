import type { Metadata } from "next";
import { Suspense } from "react";
import ShopContent from "./_components/ShopContent";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Browse our full range of authentic Eastern European foods — sausages, dairy, pastries, and more. Filter by category, search by name, and order for UK-wide delivery.",
};

function ShopSkeleton() {
  return (
    <div
      className="min-h-screen p-4 md:p-6 md:ml-4"
      style={{ background: "var(--background)" }}
    >
      <div className="content-offset-md space-y-8">
        <div
          className="h-40 sm:h-44 rounded-2xl animate-pulse"
          style={{
            background:
              "linear-gradient(90deg, var(--sidebar-bg), var(--card-bg), var(--sidebar-bg))",
          }}
        />
        <div className="h-10 w-52 rounded-lg animate-pulse" style={{ background: "var(--sidebar-bg)" }} />
        <div
          className="h-14 rounded-2xl animate-pulse max-w-3xl"
          style={{ background: "var(--card-bg)", border: "1px solid var(--sidebar-border)" }}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border overflow-hidden animate-pulse min-h-[22rem]"
              style={{
                borderColor: "var(--sidebar-border)",
                background: "var(--card-bg)",
              }}
            >
              <div className="aspect-[4/3] w-full" style={{ background: "var(--sidebar-bg)" }} />
              <div className="p-4 space-y-3">
                <div className="h-4 rounded w-3/4" style={{ background: "var(--sidebar-bg)" }} />
                <div className="h-3 rounded w-1/2" style={{ background: "var(--sidebar-bg)" }} />
                <div className="h-8 rounded-lg w-24 ml-auto" style={{ background: "var(--sidebar-bg)" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<ShopSkeleton />}>
      <ShopContent />
    </Suspense>
  );
}
