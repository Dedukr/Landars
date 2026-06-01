import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

type AdminEmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function AdminEmptyState({
  title,
  description,
  action,
}: AdminEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-10 text-center">
      <Inbox className="mb-3 size-8 text-muted-foreground" />
      <h3 className="text-lg font-semibold">{title}</h3>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
