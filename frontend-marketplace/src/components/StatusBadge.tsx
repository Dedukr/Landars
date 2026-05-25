import React from "react";
import { cn } from "@/lib/utils";
import {
  getOrderStatusPresentation,
  toneSurfaceClass,
} from "@/lib/orderStatusDisplay";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
  className?: string;
}

export default function StatusBadge({
  status,
  size = "md",
  className,
}: StatusBadgeProps) {
  const presentation = getOrderStatusPresentation(status);
  const tone = toneSurfaceClass(presentation.tone);
  const Icon = presentation.Icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm",
        className
      )}
      style={{
        background: tone.bg,
        color: "var(--foreground)",
        borderColor: tone.border,
      }}
    >
      <Icon
        className={cn("shrink-0", size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")}
        style={{ color: tone.iconWrap }}
        aria-hidden
      />
      <span>{presentation.label}</span>
    </span>
  );
}
