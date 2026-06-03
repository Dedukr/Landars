"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { DashboardAlerts } from "@/components/admin/dashboard/DashboardAlerts";
import { DashboardKPIGrid } from "@/components/admin/dashboard/DashboardKPIGrid";
import { DashboardPeriodSelector } from "@/components/admin/dashboard/DashboardPeriodSelector";
import { DashboardRecentOrders } from "@/components/admin/dashboard/DashboardRecentOrders";
import { DashboardTopProducts } from "@/components/admin/dashboard/DashboardTopProducts";
import { OrdersBarChart } from "@/components/admin/dashboard/OrdersBarChart";
import { SalesAreaChart } from "@/components/admin/dashboard/SalesAreaChart";
import { StatusDonutChart } from "@/components/admin/dashboard/StatusDonutChart";
import { TopProductsBarChart } from "@/components/admin/dashboard/TopProductsBarChart";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminErrorState } from "@/components/admin/ui/AdminErrorState";
import { AdminLoadingState } from "@/components/admin/ui/AdminLoadingState";
import {
  DashboardData,
  DashboardPeriod,
  getDashboardData,
} from "@/lib/api/dashboard";

function isValidPeriod(value: string | null): value is DashboardPeriod {
  return ["7d", "30d", "90d", "this_month"].includes(value ?? "");
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const rawPeriod = searchParams.get("period");
  const period: DashboardPeriod = isValidPeriod(rawPeriod) ? rawPeriod : "30d";

  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getDashboardData(period);
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setError("Could not load dashboard data.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [period, reloadKey]);

  const header = (
    <AdminPageHeader
      title="Dashboard"
      description="Overview of sales, orders, payments, shipments, and operational issues."
      actions={<DashboardPeriodSelector value={period} />}
    />
  );

  if (isLoading) return <>{header}<AdminLoadingState /></>;

  if (error || !data) {
    return (
      <>
        {header}
        <AdminErrorState
          title="Could not load dashboard"
          description={error ?? "Unknown error."}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      </>
    );
  }

  return (
    <>
      {header}

      {/* KPI grid */}
      <DashboardKPIGrid kpis={data.kpis} period={period} />

      {/* Row 1 — Revenue + Orders charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SalesAreaChart data={data.sales_chart} />
        <OrdersBarChart data={data.sales_chart} />
      </div>

      {/* Row 2 — Status donut charts (order status is the main one for v1) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <StatusDonutChart
          title="Orders by status"
          description="Order status breakdown"
          data={data.order_status_breakdown}
        />
        <StatusDonutChart
          title="Invoices by status"
          description="Invoice status breakdown"
          data={data.invoice_status_breakdown}
          emptyMessage="No invoices this period."
        />
        <StatusDonutChart
          title="Reconciliation"
          description="Bank transaction match status"
          data={data.reconciliation_breakdown}
          emptyMessage="No bank transactions this period."
        />
      </div>

      {/* Row 3 — Top products chart + Shipment status */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TopProductsBarChart products={data.top_products} />
        {data.shipment_status_breakdown.length > 0 ? (
          <StatusDonutChart
            title="Shipments by status"
            description="Shipment status breakdown"
            data={data.shipment_status_breakdown}
          />
        ) : (
          <AdminCard title="Shipments by status" description="Shipment status breakdown">
            <p className="py-6 text-center text-sm text-muted-foreground">
              No shipments this period.
            </p>
          </AdminCard>
        )}
      </div>

      {/* Row 4 — Recent orders + Alerts */}
      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardRecentOrders orders={data.recent_orders} />
        <DashboardAlerts alerts={data.alerts} />
      </div>

      {/* Top products table (detail view below charts) */}
      <DashboardTopProducts products={data.top_products} />
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<AdminLoadingState />}>
      <DashboardContent />
    </Suspense>
  );
}
