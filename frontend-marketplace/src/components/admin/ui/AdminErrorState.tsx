import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

type AdminErrorStateProps = {
  title?: string;
  message: string;
  action?: ReactNode;
};

export function AdminErrorState({
  title = "Something went wrong",
  message,
  action,
}: AdminErrorStateProps) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 text-destructive" />
        <div>
          <h3 className="font-semibold text-destructive">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
