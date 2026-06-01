import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";

export default function WishlistsDashboardPage() {
  return (
    <>
      <AdminPageHeader
        title="Wishlists"
        description="Review customer wishlist activity."
      />
      <AdminEmptyState
        title="Wishlists module is not connected yet"
        description="The design shell is ready. Wishlist data will be connected in the next implementation phase."
      />
    </>
  );
}
