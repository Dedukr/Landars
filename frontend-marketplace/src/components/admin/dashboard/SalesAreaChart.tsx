"use client";

import {
  Area,
  AreaChart,
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
      <p className="text-primary">Revenue: £{payload[0].value.toFixed(2)}</p>
    </div>
  );
}

export function SalesAreaChart({ data }: Props) {
  const chartData = data.map((e) => ({
    date: e.date,
    revenue: parseFloat(e.revenue),
  }));

  return (
    <AdminCard
      title="Revenue over time"
      description="Daily revenue (paid orders)"
    >
      {chartData.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No revenue data for the selected period.
        </p>
      ) : (
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="revenueGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="10%"
                    stopColor="hsl(var(--primary))"
                    stopOpacity={0.25}
                  />
                  <stop
                    offset="95%"
                    stopColor="hsl(var(--primary))"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tickFormatter={fmt}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v: number) => `£${v}`}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#revenueGradient)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </AdminCard>
  );
}
