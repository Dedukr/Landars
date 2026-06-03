"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AdminCard } from "@/components/admin/ui/AdminCard";
import { SalesChartPoint } from "./dashboard.types";

type Props = {
  data: SalesChartPoint[];
};

function fmt(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

type TooltipProps = {
  active?: boolean;
  label?: string;
  payload?: { value: number }[];
};

function ChartTooltip({ active, label, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 text-sm shadow-md">
      <p className="mb-1 font-medium">{label ? fmt(label) : ""}</p>
      <p className="text-muted-foreground">Orders: {payload[0].value}</p>
    </div>
  );
}

export function OrdersBarChart({ data }: Props) {
  const chartData = data.map((e) => ({ date: e.date, orders: e.orders }));

  return (
    <AdminCard title="Orders over time" description="Daily order count">
      {chartData.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No order data for the selected period.
        </p>
      ) : (
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmt}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={28}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
              <Bar
                dataKey="orders"
                fill="hsl(var(--muted-foreground) / 0.5)"
                radius={[3, 3, 0, 0]}
                maxBarSize={14}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </AdminCard>
  );
}
