import { StatusDonutChart } from "./StatusDonutChart";
import { StatusBreakdownItem } from "./dashboard.types";

type Props = {
  data: StatusBreakdownItem[];
};

export function ReconciliationStatusDonut({ data }: Props) {
  return (
    <StatusDonutChart
      title="Reconciliation"
      description="Bank transaction match status"
      data={data}
      emptyMessage="No bank transactions this period."
    />
  );
}
