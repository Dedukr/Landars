import { StatusDonutChart } from "./StatusDonutChart";
import { StatusBreakdownEntry } from "./dashboard.types";

type Props = {
  data: StatusBreakdownEntry[];
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
