import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";

export default function OrdersDashboardPage() {
  return (
    <>
      <AdminPageHeader
        title="Orders"
        description="View and manage customer orders."
      />
      <AdminEmptyState
        title="Orders module is not connected yet"
        description="The design shell is ready. Order data will be connected in the next implementation phase."
      />
    </>
  );
}
