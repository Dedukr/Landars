import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";

export default function ReviewsDashboardPage() {
  return (
    <>
      <AdminPageHeader
        title="Reviews"
        description="Monitor and moderate customer product reviews."
      />
      <AdminEmptyState
        title="Reviews module is not connected yet"
        description="The design shell is ready. Review data will be connected in the next implementation phase."
      />
    </>
  );
}
