"use client";

import { useEffect, useState } from "react";
import { Package, ShoppingCart, Truck, Users } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminErrorState } from "@/components/admin/ui/AdminErrorState";
import { AdminLoadingState } from "@/components/admin/ui/AdminLoadingState";
import { AdminMetricCard } from "@/components/admin/ui/AdminMetricCard";
import { DashboardSummary, getDashboardSummary } from "@/lib/api/dashboard";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    async function loadSummary() {
      setIsLoading(true);
      setError(null);

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
  }, [reloadKey]);

  if (isLoading) {
    return (
      <>
        <AdminPageHeader
          title="Dashboard"
          description="Overview of LandarsFood operations."
        />
        <AdminLoadingState />
      </>
    );
  }

  if (error) {
    return (
      <>
        <AdminPageHeader
          title="Dashboard"
          description="Overview of LandarsFood operations."
        />
        <AdminErrorState
          title="Could not load dashboard summary"
          description={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Dashboard"
        description="Overview of LandarsFood operations."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          title="Orders"
          value={data?.total_orders ?? "-"}
          description="Total orders"
          icon={<ShoppingCart className="h-5 w-5" />}
        />

        <AdminMetricCard
          title="Products"
          value={data?.total_products ?? "-"}
          description="Products in catalogue"
          icon={<Package className="h-5 w-5" />}
        />

        <AdminMetricCard
          title="Customers"
          value={data?.total_customers ?? "-"}
          description="Registered customers"
          icon={<Users className="h-5 w-5" />}
        />

        <AdminMetricCard
          title="Shipments"
          value={data?.total_shipments ?? "-"}
          description="Created shipments"
          icon={<Truck className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminCard
          title="Recent activity"
          description="Operational activity will appear here."
        >
          <p className="text-sm text-muted-foreground">
            Activity feed will be connected later.
          </p>
        </AdminCard>

        <AdminCard
          title="Admin notes"
          description="Important system information."
        >
          <p className="text-sm text-muted-foreground">
            Dashboard foundation is ready.
          </p>
        </AdminCard>
      </div>
    </>
  );
}
