import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminStatusBadge } from "@/components/admin/ui/AdminStatusBadge";
import { StatusBreakdownEntry } from "@/lib/api/dashboard";

type BreakdownCardProps = {
  title: string;
  data: StatusBreakdownEntry[];
  emptyMessage?: string;
};

function BreakdownCard({ title, data, emptyMessage }: BreakdownCardProps) {
  const total = data.reduce((sum, e) => sum + e.count, 0);

  return (
    <AdminCard title={title}>
      {data.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {emptyMessage ?? "No data for this period."}
        </p>
      ) : (
        <div className="space-y-2">
          {data.map((entry) => {
            const pct = total > 0 ? Math.round((entry.count / total) * 100) : 0;
            return (
              <div key={entry.status} className="flex items-center gap-3">
                <div className="w-28 shrink-0">
                  <AdminStatusBadge status={entry.status} />
                </div>
                <div className="flex-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <span className="w-8 text-right text-sm font-medium tabular-nums">
                  {entry.count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </AdminCard>
  );
}

type Props = {
  orderBreakdown: StatusBreakdownEntry[];
  invoiceBreakdown: StatusBreakdownEntry[];
  shipmentBreakdown: StatusBreakdownEntry[];
  reconciliationBreakdown: StatusBreakdownEntry[];
};

export function DashboardStatusBreakdowns({
  orderBreakdown,
  invoiceBreakdown,
  shipmentBreakdown,
  reconciliationBreakdown,
}: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <BreakdownCard title="Order status" data={orderBreakdown} />
      <BreakdownCard
        title="Invoice status"
        data={invoiceBreakdown}
        emptyMessage="No invoices this period."
      />
      <BreakdownCard
        title="Shipments"
        data={shipmentBreakdown}
        emptyMessage="No shipments this period."
      />
      <BreakdownCard
        title="Reconciliation"
        data={reconciliationBreakdown}
        emptyMessage="No transactions this period."
      />
    </div>
  );
}
