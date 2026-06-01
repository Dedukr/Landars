import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";

export default function ReportsDashboardPage() {
  return (
    <>
      <AdminPageHeader
        title="Reports"
        description="Generate operational and accounting reports."
      />
      <AdminEmptyState
        title="Reports module is not connected yet"
        description="The design shell is ready. Reporting data will be connected in the next implementation phase."
      />
    </>
  );
}
