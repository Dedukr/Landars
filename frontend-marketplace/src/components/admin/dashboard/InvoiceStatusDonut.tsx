import { StatusDonutChart } from "./StatusDonutChart";
import { StatusBreakdownEntry } from "./dashboard.types";

type Props = {
  data: StatusBreakdownEntry[];
};

export function InvoiceStatusDonut({ data }: Props) {
  return (
    <StatusDonutChart
      title="Invoices by status"
      description="Invoice status breakdown"
      data={data}
      emptyMessage="No invoices this period."
    />
  );
}
