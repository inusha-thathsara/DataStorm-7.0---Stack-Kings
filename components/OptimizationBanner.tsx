"use client";

import { useEffect, useState } from "react";
import { Stat } from "@/components/ui/Stat";
import type { OptimizationSummary } from "@/lib/types";

export function OptimizationBanner() {
  const [summary, setSummary] = useState<OptimizationSummary | null>(null);

  useEffect(() => {
    fetch("/data/optimization_summary.json")
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  if (!summary || !summary.total_spend_lkr) return null;

  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white shadow-md">
      <p className="text-sm font-semibold tracking-wide text-emerald-300">
        Western Province LKR 5M optimizer
      </p>
      <div className="mt-4 flex flex-wrap gap-6">
        <Stat label="Total spend" value={summary.total_spend_lkr} />
        <Stat label="Incremental volume" value={`${summary.total_incremental_liters} L`} />
        <Stat label="ROI" value={`${summary.roi_liters_per_1000_lkr} L / 1k LKR`} />
        <Stat label="Lift vs naive" value={`${summary.optimizer_lift_pct}%`} />
      </div>
    </div>
  );
}
