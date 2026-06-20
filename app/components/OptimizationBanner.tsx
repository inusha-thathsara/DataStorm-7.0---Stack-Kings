"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { Stat } from "@/components/ui/Stat";
import type { OptimizationSummary } from "@/lib/types";

export function OptimizationBanner() {
  const [summary, setSummary] = useState<OptimizationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/optimization-summary")
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((json: { summary: OptimizationSummary }) => setSummary(json.summary))
      .catch(() => {
        setSummary(null);
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mb-6 overflow-hidden rounded-xl border border-border bg-surface-card p-5 shadow-card">
        <Skeleton className="h-4 w-56" />
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  if (!summary || !summary.total_spend_lkr) {
    return (
      <Alert variant="info" title="Optimizer summary unavailable" className="mb-6">
        {failed
          ? "Could not load optimizer summary. Run the pipeline export or check DATABASE_URL."
          : "No optimizer data in the current export."}
      </Alert>
    );
  }

  return (
    <div className="relative mb-6 overflow-hidden rounded-xl border border-slate-700/50 bg-gradient-to-br from-brand-navy via-slate-800 to-brand-navy p-5 text-white shadow-header">
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-500/10 blur-2xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
            Western Province optimizer
          </p>
          <p className="mt-0.5 text-sm text-slate-300">
            Piecewise LP · LKR 5M budget · marginal ROI allocation
          </p>
        </div>
        <span className="mt-2 inline-flex w-fit items-center rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/30 sm:mt-0">
          100% budget utilized
        </span>
      </div>
      <div className="relative mt-5 grid grid-cols-2 gap-4 border-t border-slate-700/60 pt-5 sm:grid-cols-4">
        <Stat label="Total spend" value={summary.total_spend_lkr} variant="dark" />
        <Stat label="Incremental volume" value={`${summary.total_incremental_liters} L`} variant="dark" />
        <Stat label="ROI" value={`${summary.roi_liters_per_1000_lkr} L / 1k LKR`} variant="dark" />
        <Stat label="Lift vs naive" value={`+${summary.optimizer_lift_pct}%`} variant="dark" highlight />
      </div>
    </div>
  );
}
