import type { ReactNode } from "react";

import { adminDesign } from "@/lib/admin-design";
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
    <section className={cn(adminDesign.card, className)}>
      {title || description ? (
        <div className="mb-4">
          {title ? <h2 className={adminDesign.cardTitle}>{title}</h2> : null}
          {description ? (
            <p className={`mt-1 ${adminDesign.description}`}>{description}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
