import { AdminCard } from "@/components/admin/ui/AdminCard";
import { MoneyText } from "@/components/admin/ui/MoneyText";
import { TopProduct } from "./dashboard.types";

type Props = {
  products: TopProduct[];
};

export function DashboardTopProducts({ products }: Props) {
  return (
    <AdminCard title="Top products" description="Best selling items this period">
      {products.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No sales data for the selected period.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">#</th>
                <th className="pb-2 pr-4 font-medium">Product</th>
                <th className="pb-2 pr-4 text-right font-medium">Units</th>
                <th className="pb-2 pr-4 text-right font-medium">Orders</th>
                <th className="pb-2 text-right font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((product, index) => (
                <tr key={product.id} className="hover:bg-muted/40">
                  <td className="py-2 pr-4 text-muted-foreground">
                    {index + 1}
                  </td>
                  <td className="py-2 pr-4 font-medium">{product.name}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {product.sold_quantity}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                    {product.sold_orders_count}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {product.revenue != null ? (
                      <MoneyText value={product.revenue} />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  );
}
