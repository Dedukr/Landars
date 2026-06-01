import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";

export default function CustomersDashboardPage() {
  return (
    <>
      <AdminPageHeader
        title="Customers"
        description="View and manage customer accounts."
      />
      <AdminEmptyState
        title="Customers module is not connected yet"
        description="The design shell is ready. Customer data will be connected in the next implementation phase."
      />
    </>
  );
}
