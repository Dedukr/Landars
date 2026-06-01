import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";

export default function DocumentSequencesDashboardPage() {
  return (
    <>
      <AdminPageHeader
        title="Document Sequences"
        description="Manage protected document numbering settings."
      />
      <AdminEmptyState
        title="Document sequences module is not connected yet"
        description="The design shell is ready. Sequence controls will be connected in the next implementation phase."
      />
    </>
  );
}
