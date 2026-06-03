import { AlertTriangle, Bell, Truck } from "lucide-react";

import { AdminCard } from "@/components/admin/ui/AdminCard";
import { MoneyText } from "@/components/admin/ui/MoneyText";

import { DashboardAlerts } from "./dashboard.types";

type Props = {
  alerts: DashboardAlerts;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function OperationalAlertsWidget({ alerts }: Props) {
  const totalAlerts =
    alerts.failed_shipments.length +
    alerts.unmatched_transactions.length +
    alerts.failed_notifications.length;

  return (
    <AdminCard
      title="Operational alerts"
      description={
        totalAlerts === 0
          ? "All clear"
          : `${totalAlerts} item${totalAlerts !== 1 ? "s" : ""} need attention`
      }
    >
      {totalAlerts === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No alerts at this time.
        </p>
      ) : (
        <div className="mt-2 space-y-4">
          {alerts.failed_shipments.length > 0 && (
            <section>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-destructive">
                <Truck className="h-3.5 w-3.5" />
                Failed shipments ({alerts.failed_shipments.length})
              </div>
              <div className="space-y-1.5">
                {alerts.failed_shipments.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-start justify-between gap-2 rounded-md bg-destructive/5 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-muted-foreground">
                        Order #{s.order_id}
                      </span>
                      {s.message && (
                        <p className="truncate text-xs text-muted-foreground">
                          {s.message}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(s.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {alerts.unmatched_transactions.length > 0 && (
            <section>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Unmatched transactions ({alerts.unmatched_transactions.length})
              </div>
              <div className="space-y-1.5">
                {alerts.unmatched_transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-start justify-between gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/30"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {tx.reference || "—"}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {tx.statement_date}
                      </span>
                    </div>
                    <MoneyText value={tx.amount} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {alerts.failed_notifications.length > 0 && (
            <section>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Bell className="h-3.5 w-3.5" />
                Failed notifications ({alerts.failed_notifications.length})
              </div>
              <div className="space-y-1.5">
                {alerts.failed_notifications.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start justify-between gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{n.event}</span>
                      {n.error && (
                        <p className="truncate text-xs text-muted-foreground">
                          {n.error}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(n.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AdminCard>
  );
}
