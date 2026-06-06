import {
  AlertCircle,
  Clock,
  PoundSterling,
  ShoppingCart,
  TrendingUp,
  Truck,
} from "lucide-react";

import { DashboardKpiCard } from "./DashboardKpiCard";

export type DashboardKpiGridKpis = {
  today_revenue: string;
  today_orders: number;
  average_order_value: string;
  pending_orders: number;
  unmatched_transactions: number;
  failed_shipments: number;
};

type Props = {
  kpis: DashboardKpiGridKpis;
};

export function DashboardKpiGrid({ kpis }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <DashboardKpiCard
        title="Today's revenue"
        value={`£${kpis.today_revenue}`}
        description="Paid orders today"
        icon={PoundSterling}
        href="/admin-panel/orders?status=paid&date=today"
      />
      <DashboardKpiCard
        title="Today's orders"
        value={kpis.today_orders}
        description="Orders placed today"
        icon={ShoppingCart}
        href="/admin-panel/orders?date=today"
      />
      <DashboardKpiCard
        title="Average order value"
        value={`£${kpis.average_order_value}`}
        description="Paid orders this period"
        icon={TrendingUp}
        href="/admin-panel/orders?status=paid"
      />
      <DashboardKpiCard
        title="Pending orders"
        value={kpis.pending_orders}
        description="Awaiting action"
        icon={Clock}
        href="/admin-panel/orders?status=pending"
      />
      <DashboardKpiCard
        title="Unmatched bank transactions"
        value={kpis.unmatched_transactions}
        description="Need reconciliation"
        icon={AlertCircle}
        href="/admin-panel/reconciliation/transactions?status=unmatched"
      />
      <DashboardKpiCard
        title="Failed shipments"
        value={kpis.failed_shipments}
        description="Require attention"
        icon={Truck}
        href="/admin-panel/shipments?status=failed"
      />
    </div>
  );
}
