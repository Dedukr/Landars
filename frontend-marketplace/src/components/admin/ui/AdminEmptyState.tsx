import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

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
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed bg-card p-8 text-center">
      <div className="mb-4 rounded-full bg-muted p-3 text-muted-foreground">
        {icon || <Inbox className="h-6 w-6" />}
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
