"use client";
import React, { memo } from "react";

interface SubtotalDisplayProps {
  subtotal: number;
}

const SubtotalDisplay = memo<SubtotalDisplayProps>(({ subtotal }) => {
  return (
    <div className="flex justify-between text-sm">
      <span
        style={{ color: "var(--foreground)", opacity: 0.7 }}
      >
        Subtotal
      </span>
      <span
        className="font-medium"
        style={{ color: "var(--foreground)" }}
      >
        £{subtotal.toFixed(2)}
      </span>
    </div>
  );
});

SubtotalDisplay.displayName = "SubtotalDisplay";

export default SubtotalDisplay;
