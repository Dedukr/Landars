import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";

export default function InvoicesDashboardPage() {
  return (
    <>
      <AdminPageHeader
        title="Invoices"
        description="View and manage accounting invoices."
      />
      <AdminEmptyState
        title="Invoices module is not connected yet"
        description="The design shell is ready. Invoice data will be connected in the next implementation phase."
      />
    </>
  );
}
