import { Badge } from "./badge";

type AdminStatusBadgeProps = {
  status: string;
};

function getStatusVariant(status: string) {
  const normalized = status.toLowerCase();

  if (
    ["paid", "completed", "delivered", "active", "success"].includes(normalized)
  ) {
    return "default";
  }

  if (["pending", "processing", "draft"].includes(normalized)) {
    return "secondary";
  }

  if (["cancelled", "failed", "refunded", "inactive"].includes(normalized)) {
    return "destructive";
  }

  return "outline";
}

export function AdminStatusBadge({ status }: AdminStatusBadgeProps) {
  return <Badge variant={getStatusVariant(status)}>{status.replace(/_/g, " ")}</Badge>;
}
