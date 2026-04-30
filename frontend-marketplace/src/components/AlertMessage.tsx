import React from "react";
import { CheckCircle, XCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertVariant = "success" | "error" | "warning" | "info";

const VARIANTS: Record<
  AlertVariant,
  { icon: React.ElementType; style: React.CSSProperties }
> = {
  success: {
    icon: CheckCircle,
    style: {
      background: "var(--success-bg)",
      border: "1px solid var(--success-border)",
      color: "var(--success-text)",
    },
  },
  error: {
    icon: XCircle,
    style: {
      background: "rgba(220,38,38,0.08)",
      border: "1px solid rgba(220,38,38,0.25)",
      color: "var(--destructive)",
    },
  },
  warning: {
    icon: AlertTriangle,
    style: {
      background: "rgba(217,164,65,0.1)",
      border: "1px solid rgba(217,164,65,0.3)",
      color: "#92670a",
    },
  },
  info: {
    icon: Info,
    style: {
      background: "var(--info-bg)",
      border: "1px solid var(--info-border)",
      color: "var(--info-text)",
    },
  },
};

interface AlertMessageProps {
  variant: AlertVariant;
  children: React.ReactNode;
  className?: string;
}

export default function AlertMessage({
  variant,
  children,
  className,
}: AlertMessageProps) {
  const cfg = VARIANTS[variant];
  const Icon = cfg.icon;

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3.5 rounded-xl text-sm",
        className
      )}
      style={cfg.style}
      role="alert"
    >
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}
