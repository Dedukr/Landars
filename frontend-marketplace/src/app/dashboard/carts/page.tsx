import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";

export default function CartsDashboardPage() {
  return (
    <>
      <AdminPageHeader title="Carts" description="Inspect active customer carts." />
      <AdminEmptyState
        title="Carts module is not connected yet"
        description="The design shell is ready. Cart data will be connected in the next implementation phase."
      />
    </>
  );
}
