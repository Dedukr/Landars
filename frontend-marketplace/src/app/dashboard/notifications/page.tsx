import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";

export default function NotificationsDashboardPage() {
  return (
    <>
      <AdminPageHeader
        title="Notifications"
        description="Monitor operational notification delivery."
      />
      <AdminEmptyState
        title="Notifications module is not connected yet"
        description="The design shell is ready. Notification data will be connected in the next implementation phase."
      />
    </>
  );
}
