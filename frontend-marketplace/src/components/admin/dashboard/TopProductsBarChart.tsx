"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AdminCard } from "@/components/admin/ui/AdminCard";
import { TopProduct } from "./dashboard.types";

type Props = {
  products: TopProduct[];
};

// Truncate long product names for the axis
function truncate(name: string, max = 22): string {
  return name.length > max ? name.slice(0, max - 1) + "…" : name;
}

// Stepped palette from dark to light — avoids CSS var() which SVG fill doesn't resolve
const BAR_COLORS = ["#1a1a1a", "#404040", "#666666", "#8c8c8c", "#b3b3b3"];

type TooltipPayload = { fullName: string; qty: number; revenue: string };
type TooltipProps = {
  active?: boolean;
  payload?: { payload: TooltipPayload }[];
};

function ChartTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const { fullName, qty, revenue } = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background p-3 text-sm shadow-md">
      <p className="mb-1 max-w-[200px] font-medium">{fullName}</p>
      <p className="text-muted-foreground">Units sold: {qty}</p>
      <p className="text-muted-foreground">Revenue: £{revenue}</p>
    </div>
  );
}

export function TopProductsBarChart({ products }: Props) {
  const chartData = products.map((p) => ({
    name: truncate(p.name),
    fullName: p.name,
    qty: p.sold_quantity,
    revenue: p.revenue ?? "0.00",
  }));

  return (
    <AdminCard
      title="Top products by quantity"
      description="Units sold in the selected period"
    >
      {chartData.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No product sales data for the selected period.
        </p>
      ) : (
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
            >
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: "hsl(var(--muted))" }}
              />
              <Bar dataKey="qty" radius={[0, 3, 3, 0]} maxBarSize={18}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </AdminCard>
  );
}
