"use client";

import { useEffect, useState } from "react";

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

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading dashboard...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-500">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of LandarsFood operations.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Total orders" value={data?.total_orders ?? 0} />
        <SummaryCard title="Pending orders" value={data?.pending_orders ?? 0} />
        <SummaryCard title="Products" value={data?.total_products ?? 0} />
        <SummaryCard title="Customers" value={data?.total_customers ?? 0} />
      </div>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
