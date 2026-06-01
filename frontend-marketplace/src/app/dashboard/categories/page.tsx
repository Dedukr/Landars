import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";

export default function CategoriesDashboardPage() {
  return (
    <>
      <AdminPageHeader
        title="Categories"
        description="Manage product category hierarchy."
      />
      <AdminEmptyState
        title="Categories module is not connected yet"
        description="The design shell is ready. Category data will be connected in the next implementation phase."
      />
    </>
  );
}
