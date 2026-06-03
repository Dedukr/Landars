import { StatusDonutChart } from "./StatusDonutChart";
import { StatusBreakdownItem } from "./dashboard.types";

type Props = {
  data: StatusBreakdownItem[];
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
