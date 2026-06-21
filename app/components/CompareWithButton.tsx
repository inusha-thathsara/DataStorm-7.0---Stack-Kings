"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { startCompareWith } from "@/lib/compareSelection";

type Props = {
  outletId: string;
  className?: string;
};

export function CompareWithButton({ outletId, className }: Props) {
  const router = useRouter();

  function handleClick() {
    router.push(startCompareWith(outletId));
  }

  return (
    <Button type="button" variant="outline" size="sm" className={className} onClick={handleClick}>
      Compare with…
    </Button>
  );
}
