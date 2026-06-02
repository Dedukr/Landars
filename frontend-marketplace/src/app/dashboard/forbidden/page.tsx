import { adminDesign } from "@/lib/admin-design";
import { cn } from "@/lib/utils";

export default function DashboardForbiddenPage() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className={cn("max-w-md text-center", adminDesign.card)}>
        <h1 className={adminDesign.pageTitle}>Access denied</h1>
        <p className={`mt-2 ${adminDesign.description}`}>
          You do not have permission to access the LandarsFood admin panel.
        </p>
      </div>
    </div>
  );
}
