import React from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export default function PageHeader({
  title,
  subtitle,
  action,
  className = "",
}: PageHeaderProps) {
  return (
    <div className={`mb-8 flex items-start justify-between gap-4 ${className}`}>
      <div>
        <h1
          className="text-2xl sm:text-3xl font-bold"
          style={{ color: "var(--foreground)" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="mt-1.5 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
