"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AdminCard } from "@/components/admin/ui/AdminCard";
import { SalesChartEntry } from "@/lib/api/dashboard";

type Props = {
  data: SalesChartEntry[];
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatRevenue(value: number): string {
  return `£${value.toFixed(2)}`;
}

type TooltipPayloadItem = {
  name: string;
  value: number;
  color: string;
};

type CustomTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadItem[];
};

function CustomTooltip({ active, label, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border bg-background p-3 text-sm shadow-md">
      <p className="mb-1 font-medium">{label ? formatDate(label) : ""}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name === "revenue"
            ? `Revenue: ${formatRevenue(entry.value)}`
            : `Orders: ${entry.value}`}
        </p>
      ))}
    </div>
  );
}

export function DashboardSalesChart({ data }: Props) {
  const chartData = data.map((entry) => ({
    date: entry.date,
    revenue: parseFloat(entry.revenue),
    orders: entry.orders,
  }));

  return (
    <AdminCard title="Sales" description="Daily revenue and order count">
      {chartData.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No sales data for the selected period.
        </p>
      ) : (
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="revenue"
                orientation="left"
                tickFormatter={(v: number) => `£${v}`}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <YAxis
                yAxisId="orders"
                orientation="right"
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              />
              <Area
                yAxisId="revenue"
                type="monotone"
                dataKey="revenue"
                name="revenue"
                fill="hsl(var(--primary) / 0.15)"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Bar
                yAxisId="orders"
                dataKey="orders"
                name="orders"
                fill="hsl(var(--muted-foreground) / 0.3)"
                radius={[2, 2, 0, 0]}
                maxBarSize={12}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </AdminCard>
  );
}
