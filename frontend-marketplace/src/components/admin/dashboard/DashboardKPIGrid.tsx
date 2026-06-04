import {
  AlertCircle,
  Banknote,
  Clock,
  ShoppingCart,
  TrendingUp,
  Truck,
} from "lucide-react";

import { DashboardKpiCard } from "./DashboardKpiCard";
import type { DashboardKpis } from "./dashboard.types";

type Props = {
  kpis: DashboardKpis;
};

/**
 * Six main operational KPI cards.
 *
 * Section 11 of the spec defines exactly these 6 and their links.
 * The full catalogue of KPIs (period revenue, product counts, etc.) is
 * available in the backend but intentionally omitted here to keep the top
 * of the dashboard focused on actionable metrics.
 */
export function DashboardKpiGrid({ kpis }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <DashboardKpiCard
        title="Today's revenue"
        value={`£${kpis.today_revenue}`}
        description="Paid orders today"
        icon={Banknote}
        href="/dashboard/orders?status=paid&date=today"
      />
      <DashboardKpiCard
        title="Today's orders"
        value={kpis.today_orders}
        description="Orders placed today"
        icon={ShoppingCart}
        href="/dashboard/orders?date=today"
      />
      <DashboardKpiCard
        title="Average order value"
        value={`£${kpis.average_order_value}`}
        description="Paid orders this period"
        icon={TrendingUp}
        href="/dashboard/orders?status=paid"
      />
      <DashboardKpiCard
        title="Pending orders"
        value={kpis.pending_orders}
        description="Awaiting action"
        icon={Clock}
        href="/dashboard/orders?status=pending"
      />
      <DashboardKpiCard
        title="Unmatched transactions"
        value={kpis.unmatched_transactions}
        description="Need reconciliation"
        icon={AlertCircle}
        href="/dashboard/reconciliation/transactions?status=unmatched"
      />
      <DashboardKpiCard
        title="Failed shipments"
        value={kpis.failed_shipments}
        description="Require attention"
        icon={Truck}
        href="/dashboard/shipments?status=failed"
      />
    </div>
  );
}
