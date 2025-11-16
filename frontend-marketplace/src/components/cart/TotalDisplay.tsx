"use client";
import React, { memo } from "react";

interface TotalDisplayProps {
  total: number;
}

const TotalDisplay = memo<TotalDisplayProps>(({ total }) => {
  return (
    <div
      className="pt-3"
      style={{ borderTop: "1px solid var(--sidebar-border)" }}
    >
      <div className="flex justify-between text-lg font-semibold">
        <span style={{ color: "var(--foreground)" }}>
          Total
        </span>
        <span style={{ color: "var(--foreground)" }}>
          £{total.toFixed(2)}
        </span>
      </div>
    </div>
  );
});

TotalDisplay.displayName = "TotalDisplay";

export default TotalDisplay;
