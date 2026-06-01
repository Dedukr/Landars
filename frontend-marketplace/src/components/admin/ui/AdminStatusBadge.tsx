import { Badge } from "./badge";

type AdminStatusBadgeProps = {
  status: string;
};

const toneMap: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
  pending: "secondary",
  paid: "default",
  issued: "default",
  delivered: "default",
  cancelled: "destructive",
  failed: "destructive",
};

export function AdminStatusBadge({ status }: AdminStatusBadgeProps) {
  const normalized = status.toLowerCase();
  const variant = toneMap[normalized] ?? "outline";

  return <Badge variant={variant}>{status}</Badge>;
}
