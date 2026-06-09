"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { ExplainPanel } from "@/components/ExplainPanel";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { LoadingState } from "@/components/ui/Skeleton";
import { resolveExplanation } from "@/lib/xaiClient";
import type { ExplainMeta, ExplainSource, Outlet, OutletsData } from "@/lib/types";
import Link from "next/link";

const OutletMap = dynamic(
  () => import("@/components/OutletMap").then((m) => m.OutletMap),
  { ssr: false, loading: () => <LoadingState message="Loading map…" /> }
);

function num(v: number | undefined, digits = 1): string {
  return (v ?? 0).toFixed(digits);
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm text-slate-700">
      <span className="text-slate-500">{label}: </span>
      <span className="font-medium text-slate-900">{value}</span>
    </p>
  );
}

export default function OutletPage({ params }: { params: { id: string } }) {
  const [outlet, setOutlet] = useState<Outlet | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string>("");
  const [explainError, setExplainError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<ExplainSource>("template");
  const [explainMeta, setExplainMeta] = useState<ExplainMeta | null>(null);
  const [explainWarning, setExplainWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    setLoadError(null);
    fetch("/data/outlets.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} loading outlets.json`);
        return r.json();
      })
      .then((data: OutletsData) => {
        if (cancelled) return;
        const found = data.outlets.find((o) => o.id === params.id) ?? null;
        setOutlet(found);
        if (!found) setLoadError(`Outlet ${params.id} not found in export.`);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message || "Failed to load outlet data");
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function explain() {
    if (!outlet) return;
    setLoading(true);
    setExplainError(null);
    setExplainWarning(null);
    setExplainMeta(null);
    try {
      const result = await resolveExplanation(outlet);
      if (result.error && !result.explanation) {
        throw new Error(result.error);
      }
      setExplanation(result.explanation);
      setSource(result.source);
      setExplainMeta(result.meta ?? null);
      setExplainWarning(result.warning ?? null);
    } catch (err) {
      setExplainError(err instanceof Error ? err.message : "Explain request failed");
      setExplanation("");
      setExplainMeta(null);
      setExplainWarning(null);
    } finally {
      setLoading(false);
    }
  }

  if (dataLoading) {
    return <LoadingState message="Loading outlet…" />;
  }

  if (loadError) {
    return (
      <div>
        <Link href="/" className="text-sm font-medium text-emerald-700 hover:underline">
          ← Back to browse
        </Link>
        <Alert title="Could not load outlet" className="mt-4">
          {loadError}
        </Alert>
      </div>
    );
  }

  if (!outlet) {
    return (
      <p className="text-slate-600">
        Outlet not found.{" "}
        <Link href="/" className="font-medium text-emerald-700 hover:underline">
          Back
        </Link>
      </p>
    );
  }

  return (
    <div>
      <Link href="/" className="text-sm font-medium text-emerald-700 hover:underline">
        ← Back to browse
      </Link>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{outlet.id}</h2>
        <div className="flex flex-wrap gap-2">
          <Badge tone="default">{outlet.province}</Badge>
          <Badge tone="muted">{outlet.distributorId}</Badge>
          <Badge tone="default">{outlet.outletType}</Badge>
          <Badge tone="default">{outlet.outletSize}</Badge>
        </div>
      </div>

      <div className="mt-4">
        <OutletMap outlets={[outlet]} highlightId={outlet.id} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Predicted potential</CardTitle>
          </CardHeader>
          <div className="space-y-2">
            <p className="text-2xl font-bold text-emerald-700">
              {num(outlet.predictedLiters)} L
              <span className="ml-1 text-sm font-normal text-slate-500">/ month (Jan 2026)</span>
            </p>
            <MetricRow label="Historical max" value={`${num(outlet.ownMaxVol)} L`} />
            <MetricRow label="Recent 3m avg" value={`${num(outlet.recent3mAvg)} L`} />
            <MetricRow label="Gap" value={`${num(outlet.gapLiters)} L`} />
            <MetricRow label="Jan factor" value={num(outlet.janFactor, 3)} />
            <MetricRow label="Seasonality" value={outlet.seasonalityLabel || "—"} />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Model traceability</CardTitle>
          </CardHeader>
          <div className="space-y-2">
            <MetricRow label="Cluster" value={`${outlet.clusterId || "—"} (ceiling ${num(outlet.clusterCeiling)} L)`} />
            <MetricRow label="K-Means ceiling" value={`${num(outlet.kmeansCeiling)} L`} />
            <MetricRow label="QR ceiling (τ=0.90)" value={`${num(outlet.qrCeiling)} L`} />
            <MetricRow label="Base ensemble" value={`${num(outlet.baseEnsemble)} L`} />
            <MetricRow label="Adjusted ceiling" value={`${num(outlet.adjustedCeiling)} L`} />
            <MetricRow label="Competition adjustment" value={`×${num(outlet.adjustmentFactor, 3)}`} />
            <MetricRow label="Dominant method" value={outlet.dominantMethod} />
            {outlet.modelDrivers && (
              <>
                <p className="pt-2 text-xs text-slate-500">{outlet.modelDrivers.kmeansPeerSignal}</p>
                {outlet.modelDrivers.competition && (
                  <p className="text-xs text-slate-600">
                    Competition: penalty ×
                    {(outlet.modelDrivers.competition.saturationPenalty ?? 0).toFixed(3)}, boost ×
                    {(outlet.modelDrivers.competition.isolationBoost ?? 0).toFixed(3)}
                  </p>
                )}
              </>
            )}
          </div>
        </Card>

        {outlet.modelDrivers?.qrTopDrivers && outlet.modelDrivers.qrTopDrivers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Feature importance (QR τ=0.90)</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="pb-2 pr-2">Driver</th>
                    <th className="pb-2 pr-2">Weight</th>
                    <th className="pb-2">Contrib. (L)</th>
                  </tr>
                </thead>
                <tbody>
                  {outlet.modelDrivers.qrTopDrivers.map((d) => (
                    <tr key={d.feature} className="border-b border-slate-50">
                      <td className="py-2 pr-2 text-slate-800">{d.label}</td>
                      <td className="py-2 pr-2 tabular-nums text-slate-600">{d.weight.toFixed(4)}</td>
                      <td
                        className={`py-2 tabular-nums font-medium ${
                          d.direction === "up" ? "text-emerald-700" : "text-amber-700"
                        }`}
                      >
                        {d.contributionLiters > 0 ? "+" : ""}
                        {d.contributionLiters.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Local environment</CardTitle>
          </CardHeader>
          <div className="space-y-2">
            <MetricRow label="Saturation" value={outlet.marketSaturation} />
            <MetricRow
              label="Competitor density"
              value={`${num(outlet.competitorDensity, 2)} (z=${num(outlet.competitorDensityZ, 2)})`}
            />
            <MetricRow
              label="DBSCAN zone"
              value={`${outlet.dbscanZone} ${outlet.dbscanIsCore ? "(core)" : ""}`}
            />
            <MetricRow
              label="Decay transport / food / worship"
              value={`${num(outlet.decayTransport, 2)} / ${num(outlet.decayFood, 2)} / ${num(outlet.decayWorship, 2)}`}
            />
            <MetricRow label="Decay total" value={num(outlet.decayTotal, 2)} />
            <MetricRow label="Coolers" value={String(outlet.coolerCount)} />
          </div>
        </Card>
      </div>

      {outlet.tradeSpendLkr > 0 && (
        <Card className="mt-4 border-emerald-200 bg-emerald-50">
          <CardTitle className="text-emerald-900">Western Province trade spend</CardTitle>
          <p className="mt-2 text-sm text-emerald-800">
            Allocation:{" "}
            <strong className="text-base">LKR {outlet.tradeSpendLkr.toLocaleString()}</strong>
            {outlet.predictedIncrementalLiters > 0 && (
              <>
                {" "}
                · Modeled incremental volume:{" "}
                <strong>{num(outlet.predictedIncrementalLiters)} L</strong>
              </>
            )}
          </p>
        </Card>
      )}

      <ExplainPanel
        loading={loading}
        explanation={explanation}
        source={source}
        meta={explainMeta}
        warning={explainWarning}
        error={explainError}
        onExplain={explain}
      />
    </div>
  );
}
