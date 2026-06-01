import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AdminCardProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function AdminCard({
  title,
  description,
  children,
  className,
}: AdminCardProps) {
  return (
    <section className={cn("rounded-xl border bg-card p-5 shadow-sm", className)}>
      {title || description ? (
        <div className="mb-4">
          {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
