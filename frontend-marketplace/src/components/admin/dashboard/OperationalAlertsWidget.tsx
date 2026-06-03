import type { ReactNode } from "react";

import { AlertTriangle, Bell, Truck } from "lucide-react";

import { AdminCard } from "@/components/admin/ui/AdminCard";
import { MoneyText } from "@/components/admin/ui/MoneyText";

import type { DashboardAlertItem, DashboardAlerts } from "./dashboard.types";

// ─── Internal helpers ─────────────────────────────────────────────────────────

type AlertSectionProps = {
  icon: ReactNode;
  label: string;
  colorClass: string;
  items: DashboardAlertItem[];
  rowClass: string;
  renderItem: (item: DashboardAlertItem) => ReactNode;
};

function AlertSection({ icon, label, colorClass, items, rowClass, renderItem }: AlertSectionProps) {
  return (
    <section>
      <div className={`mb-1.5 flex items-center gap-1.5 text-xs font-medium ${colorClass}`}>
        {icon}
        {label}
      </div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-start justify-between gap-2 rounded-md px-3 py-2 text-sm ${rowClass}`}
          >
            {renderItem(item)}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Widget ───────────────────────────────────────────────────────────────────

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
            <AlertSection
              icon={<Truck className="h-3.5 w-3.5" />}
              label={`Failed shipments (${alerts.failed_shipments.length})`}
              colorClass="text-destructive"
              items={alerts.failed_shipments}
              rowClass="bg-destructive/5"
              renderItem={(s) => (
                <>
                  <div className="min-w-0">
                    {s.order_id != null && (
                      <span className="font-mono text-xs text-muted-foreground">
                        Order #{s.order_id}
                      </span>
                    )}
                    {s.message && (
                      <p className="truncate text-xs text-muted-foreground">{s.message}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(s.created_at ?? null)}
                  </span>
                </>
              )}
            />
          )}

          {alerts.unmatched_transactions.length > 0 && (
            <AlertSection
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              label={`Unmatched transactions (${alerts.unmatched_transactions.length})`}
              colorClass="text-amber-600 dark:text-amber-400"
              items={alerts.unmatched_transactions}
              rowClass="bg-amber-50 dark:bg-amber-950/30"
              renderItem={(tx) => (
                <>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{tx.reference || "—"}</p>
                    {tx.statement_date && (
                      <span className="text-xs text-muted-foreground">{tx.statement_date}</span>
                    )}
                  </div>
                  {tx.amount != null && <MoneyText value={tx.amount} />}
                </>
              )}
            />
          )}

          {alerts.failed_notifications.length > 0 && (
            <AlertSection
              icon={<Bell className="h-3.5 w-3.5" />}
              label={`Failed notifications (${alerts.failed_notifications.length})`}
              colorClass="text-muted-foreground"
              items={alerts.failed_notifications}
              rowClass="bg-muted/60"
              renderItem={(n) => (
                <>
                  <div className="min-w-0">
                    {n.event && <span className="font-medium">{n.event}</span>}
                    {n.error && (
                      <p className="truncate text-xs text-muted-foreground">{n.error}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(n.created_at ?? null)}
                  </span>
                </>
              )}
            />
          )}
        </div>
      )}
    </AdminCard>
  );
}
