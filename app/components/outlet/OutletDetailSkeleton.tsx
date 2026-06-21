import { Skeleton } from "@/components/ui/Skeleton";

export function OutletDetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading outlet details">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl md:col-span-2" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
