"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { DashboardAlerts } from "@/components/admin/dashboard/DashboardAlerts";
import { DashboardKPIGrid } from "@/components/admin/dashboard/DashboardKPIGrid";
import { DashboardPeriodSelector } from "@/components/admin/dashboard/DashboardPeriodSelector";
import { DashboardRecentOrders } from "@/components/admin/dashboard/DashboardRecentOrders";
import { DashboardSalesChart } from "@/components/admin/dashboard/DashboardSalesChart";
import { DashboardStatusBreakdowns } from "@/components/admin/dashboard/DashboardStatusBreakdowns";
import { DashboardTopProducts } from "@/components/admin/dashboard/DashboardTopProducts";
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
    return () => {
      cancelled = true;
    };
  }, [period, reloadKey]);

  const header = (
    <AdminPageHeader
      title="Dashboard"
      description="Overview of LandarsFood operations."
      actions={<DashboardPeriodSelector value={period} />}
    />
  );

  if (isLoading) {
    return (
      <>
        {header}
        <AdminLoadingState />
      </>
    );
  }

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

      {/* KPI cards */}
      <DashboardKPIGrid kpis={data.kpis} period={period} />

      {/* Sales chart + Alerts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DashboardSalesChart data={data.sales_chart} />
        </div>
        <DashboardAlerts alerts={data.alerts} />
      </div>

      {/* Status breakdowns */}
      <DashboardStatusBreakdowns
        orderBreakdown={data.order_status_breakdown}
        invoiceBreakdown={data.invoice_status_breakdown}
        shipmentBreakdown={data.shipment_status_breakdown}
        reconciliationBreakdown={data.reconciliation_breakdown}
      />

      {/* Top products + Recent orders */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardTopProducts products={data.top_products} />
        <DashboardRecentOrders orders={data.recent_orders} />
      </div>
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
