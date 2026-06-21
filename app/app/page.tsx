import { Suspense } from "react";
import HomePageClient from "./HomePageClient";
import { LoadingState } from "@/components/ui/Skeleton";

export default function Page() {
  return (
    <Suspense fallback={<LoadingState message="Loading outlet data…" />}>
      <HomePageClient />
    </Suspense>
  );
}
