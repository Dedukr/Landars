import {
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  CalendarDays,
  Clock,
  CreditCard,
  FileText,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";

import { AdminMetricCard } from "@/components/admin/ui/AdminMetricCard";
import { DashboardKPIs, DashboardPeriod, PERIOD_OPTIONS } from "@/lib/api/dashboard";

type Props = {
  kpis: DashboardKPIs;
  period: DashboardPeriod;
};

function periodLabel(period: DashboardPeriod): string {
  return PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? period;
}

export function DashboardKPIGrid({ kpis, period }: Props) {
  const label = periodLabel(period);

  return (
    <div className="space-y-4">
      {/* Today */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Today
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminMetricCard
            title="Today&rsquo;s revenue"
            value={`£${kpis.today_revenue}`}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <AdminMetricCard
            title="Today&rsquo;s orders"
            value={kpis.today_orders}
            icon={<ShoppingCart className="h-4 w-4" />}
          />
          <AdminMetricCard
            title="Pending orders"
            value={kpis.pending_orders}
            description="Awaiting action"
            icon={<Clock className="h-4 w-4" />}
          />
          <AdminMetricCard
            title="New customers"
            value={kpis.new_customers}
            description={label}
            icon={<Users className="h-4 w-4" />}
          />
        </div>
      </div>

      {/* Period */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminMetricCard
            title="Revenue"
            value={`£${kpis.revenue}`}
            icon={<CreditCard className="h-4 w-4" />}
          />
          <AdminMetricCard
            title="Paid orders"
            value={kpis.paid_orders}
            icon={<ShoppingBag className="h-4 w-4" />}
          />
          <AdminMetricCard
            title="Avg order value"
            value={`£${kpis.average_order_value}`}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <AdminMetricCard
            title="Total orders"
            value={kpis.orders_count}
            icon={<ShoppingCart className="h-4 w-4" />}
          />
        </div>
      </div>

      {/* Operations */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Operations
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminMetricCard
            title="Unmatched transactions"
            value={kpis.unmatched_transactions}
            description="Needs reconciliation"
            icon={<ArrowLeftRight className="h-4 w-4" />}
          />
          <AdminMetricCard
            title="Failed shipments"
            value={kpis.failed_shipments}
            icon={<Truck className="h-4 w-4" />}
          />
          <AdminMetricCard
            title="Failed notifications"
            value={kpis.failed_notifications}
            description="Last 7 days"
            icon={<Bell className="h-4 w-4" />}
          />
          <AdminMetricCard
            title="Invoices issued"
            value={kpis.invoices_issued_this_month}
            description="This month"
            icon={<FileText className="h-4 w-4" />}
          />
        </div>
      </div>

      {/* Products & catalogue */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Catalogue
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminMetricCard
            title="Total products"
            value={kpis.total_products}
            icon={<ShoppingBag className="h-4 w-4" />}
          />
          <AdminMetricCard
            title="Active products"
            value={kpis.active_products}
            icon={<ShoppingBag className="h-4 w-4" />}
          />
          <AdminMetricCard
            title="Total customers"
            value={kpis.total_customers}
            icon={<Users className="h-4 w-4" />}
          />
          <AdminMetricCard
            title="Top product sold"
            value={kpis.top_product_sold_quantity}
            description={`Units • ${label}`}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
        </div>
      </div>
    </div>
  );
}
