import { Skeleton } from "./skeleton";

type AdminLoadingStateProps = {
  rows?: number;
};

export function AdminLoadingState({ rows = 5 }: AdminLoadingStateProps) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-40" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
