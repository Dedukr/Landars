import React from "react";

export default function SectionSeparator() {
  return (
    <div
      className="py-6 md:py-8"
      style={{ background: "var(--background)" }}
      aria-hidden
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <span
            className="h-px flex-1"
            style={{
              background:
                "linear-gradient(to right, transparent, var(--sidebar-border))",
            }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--accent)" }}
          />
          <span
            className="h-px flex-1"
            style={{
              background:
                "linear-gradient(to left, transparent, var(--sidebar-border))",
            }}
          />
        </div>
      </div>
    </div>
  );
}
