import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";

export default function CategoryGroupsDashboardPage() {
  return (
    <>
      <AdminPageHeader
        title="Category Groups"
        description="Manage merchandising category groups."
      />
      <AdminEmptyState
        title="Category groups module is not connected yet"
        description="The design shell is ready. Category group data will be connected in the next implementation phase."
      />
    </>
  );
}
