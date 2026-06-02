import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

import { adminDesign } from "@/lib/admin-design";
import { cn } from "@/lib/utils";

type AdminEmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
};

export function AdminEmptyState({
  title,
  description,
  icon,
  action,
}: AdminEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[280px] flex-col items-center justify-center border border-dashed p-8 text-center",
        adminDesign.card,
      )}
    >
      <div className="mb-4 rounded-full bg-muted p-3 text-muted-foreground">
        {icon || <Inbox className="h-6 w-6" />}
      </div>
      <h2 className={adminDesign.cardTitle}>{title}</h2>
      {description ? (
        <p className={`mt-2 max-w-md ${adminDesign.description}`}>{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
