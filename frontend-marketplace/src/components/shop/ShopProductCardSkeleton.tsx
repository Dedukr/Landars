import React from "react";

export function ShopProductCardSkeleton() {
  return (
    <div
      className="flex flex-col rounded-2xl border overflow-hidden animate-pulse min-h-[22rem]"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
      }}
    >
      <div
        className="aspect-[4/3] w-full shrink-0"
        style={{ background: "var(--sidebar-bg)" }}
      />
      <div className="p-4 flex flex-col flex-1 gap-3">
        <div className="h-4 rounded-md w-[85%]" style={{ background: "var(--sidebar-bg)" }} />
        <div className="h-3 rounded-md w-[60%]" style={{ background: "var(--sidebar-bg)" }} />
        <div className="h-3 rounded-md w-full" style={{ background: "var(--sidebar-bg)" }} />
        <div className="mt-auto pt-4 flex justify-between gap-2">
          <div className="h-7 rounded-md w-20" style={{ background: "var(--sidebar-bg)" }} />
          <div className="h-11 rounded-xl w-[7.5rem]" style={{ background: "var(--sidebar-bg)" }} />
        </div>
      </div>
    </div>
  );
}
