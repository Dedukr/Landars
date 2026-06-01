import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";

export default function ProductsDashboardPage() {
  return (
    <>
      <AdminPageHeader
        title="Products"
        description="Create and manage catalogue products."
      />
      <AdminEmptyState
        title="Products module is not connected yet"
        description="The design shell is ready. Product data will be connected in the next implementation phase."
      />
    </>
  );
}
