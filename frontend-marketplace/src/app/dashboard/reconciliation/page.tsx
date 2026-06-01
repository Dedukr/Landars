import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";

export default function ReconciliationDashboardPage() {
  return (
    <>
      <AdminPageHeader
        title="Reconciliation"
        description="Review and match bank transactions with orders."
      />
      <AdminEmptyState
        title="Reconciliation module is not connected yet"
        description="The design shell is ready. Reconciliation data will be connected in the next implementation phase."
      />
    </>
  );
}
