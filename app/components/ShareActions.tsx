"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { copyPageLink, printPage } from "@/lib/exportExplanation";

type Props = {
  className?: string;
};

export function ShareActions({ className = "" }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyPageLink();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
        {copied ? "Link copied!" : "Copy link"}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={printPage}>
        Print / Save PDF
      </Button>
    </div>
  );
}
