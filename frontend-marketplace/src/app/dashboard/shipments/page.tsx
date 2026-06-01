import { AdminPageHeader } from "@/components/admin/shell/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";

export default function ShipmentsDashboardPage() {
  return (
    <>
      <AdminPageHeader
        title="Shipments"
        description="Track and manage fulfilment shipments."
      />
      <AdminEmptyState
        title="Shipments module is not connected yet"
        description="The design shell is ready. Shipment data will be connected in the next implementation phase."
      />
    </>
  );
}
