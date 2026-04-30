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
      <div className="content-offset-md">
        <div
          className="h-5 w-32 rounded-md animate-pulse mb-6"
          style={{ background: "var(--sidebar-bg)" }}
        />
        <div
          className="h-7 w-48 rounded-md animate-pulse mb-8"
          style={{ background: "var(--sidebar-bg)" }}
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-64 rounded-xl animate-pulse"
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--sidebar-border)",
              }}
            />
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
