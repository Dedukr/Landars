import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";

export default function CreditNotesDashboardPage() {
  return (
    <>
      <AdminPageHeader
        title="Credit Notes"
        description="View and manage credit note documents."
      />
      <AdminEmptyState
        title="Credit notes module is not connected yet"
        description="The design shell is ready. Credit note data will be connected in the next implementation phase."
      />
    </>
  );
}
