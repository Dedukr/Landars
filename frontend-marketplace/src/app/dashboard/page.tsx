"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { DashboardChartsGrid } from "@/components/admin/dashboard/DashboardChartsGrid";
import { DashboardDateRangeSelector } from "@/components/admin/dashboard/DashboardDateRangeSelector";
import { DashboardError } from "@/components/admin/dashboard/DashboardError";
import { DashboardKpiGrid } from "@/components/admin/dashboard/DashboardKpiGrid";
import { DashboardLoading } from "@/components/admin/dashboard/DashboardLoading";
import { DashboardTopProducts } from "@/components/admin/dashboard/DashboardTopProducts";
import { InvoiceStatusDonut } from "@/components/admin/dashboard/InvoiceStatusDonut";
import { OperationalAlertsWidget } from "@/components/admin/dashboard/OperationalAlertsWidget";
import { OrderStatusDonut } from "@/components/admin/dashboard/OrderStatusDonut";
import { OrdersBarChart } from "@/components/admin/dashboard/OrdersBarChart";
import { RecentOrdersWidget } from "@/components/admin/dashboard/RecentOrdersWidget";
import { ReconciliationStatusDonut } from "@/components/admin/dashboard/ReconciliationStatusDonut";
import { SalesAreaChart } from "@/components/admin/dashboard/SalesAreaChart";
import { ShipmentStatusBar } from "@/components/admin/dashboard/ShipmentStatusBar";
import { TopProductsBarChart } from "@/components/admin/dashboard/TopProductsBarChart";
import { getDashboardData } from "@/lib/api/adminDashboard";
import type { DashboardData, DashboardPeriod } from "@/lib/api/adminDashboard";

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
      actions={<DashboardDateRangeSelector value={period} />}
    />
  );

  if (isLoading) return <>{header}<DashboardLoading /></>;

  if (error || !data) {
    return (
      <>
        {header}
        <DashboardError
          message={error ?? "Unknown error."}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      </>
    );
  }

  return (
    <>
      {header}

      <DashboardKpiGrid kpis={data.kpis} period={period} />

      {/* Row 1 — Revenue area chart + Orders bar chart */}
      <DashboardChartsGrid cols={2}>
        <SalesAreaChart data={data.sales_chart} />
        <OrdersBarChart data={data.sales_chart} />
      </DashboardChartsGrid>

      {/* Row 2 — Status donuts */}
      <DashboardChartsGrid cols={3}>
        <OrderStatusDonut data={data.order_status_breakdown} />
        <InvoiceStatusDonut data={data.invoice_status_breakdown} />
        <ReconciliationStatusDonut data={data.reconciliation_breakdown} />
      </DashboardChartsGrid>

      {/* Row 3 — Top products bar chart + Shipment status */}
      <DashboardChartsGrid cols={2}>
        <TopProductsBarChart products={data.top_products} />
        <ShipmentStatusBar data={data.shipment_status_breakdown} />
      </DashboardChartsGrid>

      {/* Row 4 — Recent orders + Operational alerts */}
      <DashboardChartsGrid cols={2}>
        <RecentOrdersWidget orders={data.recent_orders} />
        <OperationalAlertsWidget alerts={data.alerts} />
      </DashboardChartsGrid>

      {/* Top products detail table */}
      <DashboardTopProducts products={data.top_products} />
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent />
    </Suspense>
  );
}
