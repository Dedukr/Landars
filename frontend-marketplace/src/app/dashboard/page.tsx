"use client";

import { useEffect, useState } from "react";

import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { AdminErrorState } from "@/components/admin/ui/AdminErrorState";
import { AdminLoadingState } from "@/components/admin/ui/AdminLoadingState";
import { AdminMetricCard } from "@/components/admin/ui/AdminMetricCard";
import { DashboardSummary, getDashboardSummary } from "@/lib/api/dashboard";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSummary() {
      try {
        const summary = await getDashboardSummary();
        setData(summary);
      } catch {
        setError("Could not load dashboard summary.");
      } finally {
        setIsLoading(false);
      }
    }

    loadSummary();
  }, []);

  return (
    <div>
      <AdminPageHeader
        title="Dashboard"
        description="Overview of LandarsFood operations."
      />

      {isLoading ? <AdminLoadingState /> : null}

      {!isLoading && error ? (
        <AdminErrorState
          title="Could not load dashboard summary"
          description={error}
        />
      ) : null}

      {!isLoading && !error ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <AdminMetricCard title="Total orders" value={data?.total_orders ?? 0} />
          <AdminMetricCard
            title="Pending orders"
            value={data?.pending_orders ?? 0}
          />
          <AdminMetricCard title="Products" value={data?.total_products ?? 0} />
          <AdminMetricCard title="Customers" value={data?.total_customers ?? 0} />
        </div>
      ) : null}
    </div>
  );
}
