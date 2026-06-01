import { TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "./card";

type AdminMetricCardProps = {
  label: string;
  value: string | number;
  trend?: string;
};

export function AdminMetricCard({ label, value, trend }: AdminMetricCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
        {trend ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="size-3.5" />
            {trend}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
