"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { AdminCard } from "@/components/admin/ui/AdminCard";
import { StatusBreakdownEntry } from "@/lib/api/dashboard";

// Colour palette — maps known status values to intentional colours.
// Unknown statuses cycle through the FALLBACK_PALETTE.
const STATUS_COLOR: Record<string, string> = {
  // Order statuses
  paid: "#10b981",
  delivered: "#059669",
  completed: "#16a34a",
  "ready to ship": "#06b6d4",
  "out for delivery": "#8b5cf6",
  issued: "#3b82f6",
  pending: "#f59e0b",
  processing: "#f97316",
  cancelled: "#ef4444",
  failed: "#dc2626",
  refunded: "#6b7280",
  draft: "#94a3b8",
  // Invoice statuses (uppercase from backend)
  PAID: "#10b981",
  ISSUED: "#3b82f6",
  PART_PAID: "#f59e0b",
  VOID: "#94a3b8",
  CANCELLED: "#ef4444",
  // Reconciliation
  matched: "#10b981",
  unmatched: "#ef4444",
  suggested: "#f59e0b",
  // Shipment
  label_ready: "#06b6d4",
  failed_retryable: "#f97316",
  failed_final: "#ef4444",
  label_download_failed: "#dc2626",
};

const FALLBACK_PALETTE = [
  "#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#84cc16",
  "#0ea5e9", "#a855f7", "#f43f5e", "#22d3ee", "#fb923c",
];

function getColor(status: string, index: number): string {
  return STATUS_COLOR[status] ?? FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

type TooltipProps = {
  active?: boolean;
  payload?: { name: string; value: number; payload: { fill: string } }[];
};

function ChartTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="rounded-lg border bg-background p-3 text-sm shadow-md">
      <p className="font-medium capitalize">{name.replace(/_/g, " ")}</p>
      <p className="text-muted-foreground">{value} orders</p>
    </div>
  );
}

type LegendProps = {
  payload?: { value: string; color: string }[];
};

function ChartLegend({ payload }: LegendProps) {
  if (!payload?.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
      {payload.map((entry) => (
        <li key={entry.value} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="capitalize">{entry.value.replace(/_/g, " ")}</span>
        </li>
      ))}
    </ul>
  );
}

type Props = {
  title: string;
  description?: string;
  data: StatusBreakdownEntry[];
  emptyMessage?: string;
};

export function StatusDonutChart({ title, description, data, emptyMessage }: Props) {
  const total = data.reduce((s, e) => s + e.count, 0);
  const chartData = data
    .filter((e) => e.count > 0)
    .map((e, i) => ({ name: e.status, value: e.count, fill: getColor(e.status, i) }));

  return (
    <AdminCard title={title} description={description}>
      {chartData.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {emptyMessage ?? "No data for this period."}
        </p>
      ) : (
        <>
          <div className="relative mx-auto h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="80%"
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend content={<ChartLegend />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Total in donut centre */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-2xl font-semibold">{total}</p>
                <p className="text-xs text-muted-foreground">total</p>
              </div>
            </div>
          </div>
        </>
      )}
    </AdminCard>
  );
}
