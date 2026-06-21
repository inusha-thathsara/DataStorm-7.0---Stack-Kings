import { Suspense } from "react";
import ComparePageClient from "./ComparePageClient";
import { LoadingState } from "@/components/ui/Skeleton";

export default function ComparePage() {
  return (
    <Suspense fallback={<LoadingState message="Loading comparison…" />}>
      <ComparePageClient />
    </Suspense>
  );
}
