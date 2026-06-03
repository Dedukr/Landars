import Link from "next/link";

import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminStatusBadge } from "@/components/admin/ui/AdminStatusBadge";
import { MoneyText } from "@/components/admin/ui/MoneyText";

import { RecentOrder } from "./dashboard.types";

type Props = {
  orders: RecentOrder[];
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RecentOrdersWidget({ orders }: Props) {
  return (
    <AdminCard title="Recent orders" description="Latest 10 orders">
      {orders.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No recent orders.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Ref</th>
                <th className="pb-2 pr-3 font-medium">Customer</th>
                <th className="pb-2 pr-3 font-medium">Status</th>
                <th className="pb-2 pr-3 text-right font-medium">Total</th>
                <th className="pb-2 text-right font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-muted/40">
                  <td className="py-2 pr-3">
                    <Link
                      href={`/dashboard/orders?id=${order.id}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {order.reference}
                    </Link>
                  </td>
                  <td className="max-w-[140px] truncate py-2 pr-3 font-medium">
                    {order.customer_name}
                  </td>
                  <td className="py-2 pr-3">
                    <AdminStatusBadge status={order.status} />
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    <MoneyText value={order.total} />
                  </td>
                  <td className="py-2 text-right text-xs text-muted-foreground">
                    {formatDateTime(order.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 border-t pt-3">
        <Link
          href="/dashboard/orders"
          className="text-xs text-primary hover:underline"
        >
          View all orders →
        </Link>
      </div>
    </AdminCard>
  );
}
