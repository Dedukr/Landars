import { StatusDonutChart } from "./StatusDonutChart";
import { StatusBreakdownItem } from "./dashboard.types";

type Props = {
  data: StatusBreakdownItem[];
};

/**
 * Shipment status breakdown chart.
 * Currently implemented as a donut; can be swapped for a horizontal stacked
 * bar chart once the shipment module is fully live.
 */
export function ShipmentStatusBar({ data }: Props) {
  return (
    <StatusDonutChart
      title="Shipments by status"
      description="Shipment status breakdown"
      data={data}
      emptyMessage="No shipments this period."
    />
  );
}
