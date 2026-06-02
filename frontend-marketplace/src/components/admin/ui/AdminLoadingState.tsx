import { adminDesign } from "@/lib/admin-design";
import { Skeleton } from "./skeleton";

export function AdminLoadingState() {
  return (
    <div className={adminDesign.pageSection}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
