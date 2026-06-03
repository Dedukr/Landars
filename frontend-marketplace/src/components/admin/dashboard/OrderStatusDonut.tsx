import { StatusDonutChart } from "./StatusDonutChart";
import { StatusBreakdownEntry } from "./dashboard.types";

type Props = {
  data: StatusBreakdownEntry[];
};

export function OrderStatusDonut({ data }: Props) {
  return (
    <StatusDonutChart
      title="Orders by status"
      description="Order status breakdown"
      data={data}
      emptyMessage="No orders this period."
    />
  );
}
