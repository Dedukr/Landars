import { AlertTriangle } from "lucide-react";

import { adminDesign } from "@/lib/admin-design";
import { cn } from "@/lib/utils";
import { Button } from "./button";

type AdminErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
};

export function AdminErrorState({
  title = "Something went wrong",
  description = "The data could not be loaded.",
  onRetry,
}: AdminErrorStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[280px] flex-col items-center justify-center p-8 text-center",
        adminDesign.card,
      )}
    >
      <div className="mb-4 rounded-full bg-destructive/10 p-3 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h2 className={adminDesign.cardTitle}>{title}</h2>
      <p className={`mt-2 max-w-md ${adminDesign.description}`}>{description}</p>
      {onRetry ? (
        <Button className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
