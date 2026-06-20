"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ExplainPanel } from "@/components/ExplainPanel";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Card, CardTitle, PanelHeader, PanelHeaderTitle } from "@/components/ui/Card";
import { MetricRow } from "@/components/ui/MetricRow";
import { LoadingState } from "@/components/ui/Skeleton";
import { resolveExplanation } from "@/lib/xaiClient";
import type { ExplainMeta, ExplainSource, Outlet } from "@/lib/types";
import Link from "next/link";

const OutletMap = dynamic(
  () => import("@/components/OutletMap").then((m) => m.OutletMap),
  { ssr: false, loading: () => <LoadingState message="Loading map…" /> }
);

function num(v: number | undefined, digits = 1): string {
  return (v ?? 0).toFixed(digits);
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
    fetch(`/api/outlets/${encodeURIComponent(params.id)}`)
      .then((r) => {
        if (r.status === 403) throw new Error("FORBIDDEN");
        if (r.status === 404) throw new Error(`Outlet ${params.id} not found in export.`);
        if (!r.ok) throw new Error(`HTTP ${r.status} loading outlet`);
        return r.json();
      })
      .then((data: { outlet: Outlet }) => {
        if (cancelled) return;
        setOutlet(data.outlet);
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
    if (loadError === "FORBIDDEN") {
      return (
        <div>
          <Link
            href="/forbidden"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-accent transition-colors hover:text-brand-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2"
          >
            View access details
          </Link>
          <Alert title="Access denied" variant="warning" className="mt-4">
            This outlet is outside your assigned scope. Western-scoped accounts can only view
            Western Province outlets.
          </Alert>
        </div>
      );
    }
    return (
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-accent transition-colors hover:text-brand-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2"
        >
          <span aria-hidden>←</span> Back to browse
        </Link>
        <Alert title="Could not load outlet" variant="error" className="mt-4">
          {loadError}
        </Alert>
      </div>
    );
  }

  if (!outlet) {
    return (
      <p className="text-text-secondary">
        Outlet not found.{" "}
        <Link
          href="/"
          className="font-medium text-brand-accent hover:text-brand-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1"
        >
          Back
        </Link>
      </p>
    );
  }

  const upliftPct =
    outlet.ownMaxVol > 0
      ? ((outlet.predictedLiters / outlet.ownMaxVol - 1) * 100).toFixed(0)
      : null;

  return (
    <div className="space-y-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-accent transition-colors hover:text-brand-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2"
      >
        <span aria-hidden>←</span> Back to browse
      </Link>

      <Card className="overflow-hidden p-0 shadow-card">
        <div className="border-b border-border-muted bg-gradient-to-r from-surface-muted to-semantic-success-bg/30 px-5 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div>
              <h1 className="text-display-sm text-text-primary">{outlet.id}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone="default">{outlet.province}</Badge>
                <Badge tone="muted">{outlet.distributorId}</Badge>
                <Badge tone="default">{outlet.outletType}</Badge>
                <Badge tone="default">{outlet.outletSize}</Badge>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Predicted Jan 2026
              </p>
              <p className="text-display-lg tabular-nums text-brand-accent">
                {num(outlet.predictedLiters)}{" "}
                <span className="text-lg font-semibold text-text-muted">L</span>
              </p>
              {upliftPct !== null && (
                <Badge tone="success" className="mt-1">
                  +{upliftPct}% above historical max
                </Badge>
              )}
            </div>
          </div>
        </div>
      </Card>

      <OutletMap outlets={[outlet]} highlightId={outlet.id} showDetailLinks={false} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="shadow-card">
          <PanelHeader className="mb-0 border-0 bg-transparent px-0 py-0">
            <PanelHeaderTitle className="normal-case tracking-normal text-base text-text-primary">
              Predicted potential
            </PanelHeaderTitle>
          </PanelHeader>
          <div className="mt-3 space-y-2">
            <p className="text-2xl font-bold text-brand-accent">
              {num(outlet.predictedLiters)} L
              <span className="ml-1 text-sm font-normal text-text-muted">/ month (Jan 2026)</span>
            </p>
            <MetricRow label="Historical max" value={`${num(outlet.ownMaxVol)} L`} />
            <MetricRow label="Recent 3m avg" value={`${num(outlet.recent3mAvg)} L`} />
            <MetricRow label="Gap" value={`${num(outlet.gapLiters)} L`} />
            <MetricRow label="Jan factor" value={num(outlet.janFactor, 3)} />
            <MetricRow label="Seasonality" value={outlet.seasonalityLabel || "—"} />
          </div>
        </Card>

        <Card className="shadow-card">
          <PanelHeader className="mb-0 border-0 bg-transparent px-0 py-0">
            <PanelHeaderTitle className="normal-case tracking-normal text-base text-text-primary">
              Model traceability
            </PanelHeaderTitle>
          </PanelHeader>
          <div className="mt-3 space-y-2">
            <MetricRow label="Cluster" value={`${outlet.clusterId || "—"} (ceiling ${num(outlet.clusterCeiling)} L)`} />
            <MetricRow label="K-Means ceiling" value={`${num(outlet.kmeansCeiling)} L`} />
            <MetricRow label="QR ceiling (τ=0.90)" value={`${num(outlet.qrCeiling)} L`} />
            <MetricRow label="Base ensemble" value={`${num(outlet.baseEnsemble)} L`} />
            <MetricRow label="Adjusted ceiling" value={`${num(outlet.adjustedCeiling)} L`} />
            <MetricRow label="Competition adjustment" value={`×${num(outlet.adjustmentFactor, 3)}`} />
            <MetricRow label="Dominant method" value={outlet.dominantMethod} />
            {outlet.modelDrivers && (
              <>
                <p className="pt-2 text-xs text-text-muted">{outlet.modelDrivers.kmeansPeerSignal}</p>
                {outlet.modelDrivers.competition && (
                  <p className="text-xs text-text-secondary">
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
          <Card className="shadow-card">
            <PanelHeader className="mb-0 border-0 bg-transparent px-0 py-0">
              <PanelHeaderTitle className="normal-case tracking-normal text-base text-text-primary">
                Feature importance (QR τ=0.90)
              </PanelHeaderTitle>
            </PanelHeader>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase text-text-muted">
                    <th className="pb-2 pr-2">Driver</th>
                    <th className="pb-2 pr-2">Weight</th>
                    <th className="pb-2">Contrib. (L)</th>
                  </tr>
                </thead>
                <tbody>
                  {outlet.modelDrivers.qrTopDrivers.map((d) => (
                    <tr key={d.feature} className="border-b border-border-muted">
                      <td className="py-2 pr-2 text-text-primary">{d.label}</td>
                      <td className="py-2 pr-2 tabular-nums text-text-secondary">{d.weight.toFixed(4)}</td>
                      <td
                        className={`py-2 tabular-nums font-medium ${
                          d.direction === "up" ? "text-brand-accent" : "text-semantic-warning"
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

        <Card className="shadow-card">
          <PanelHeader className="mb-0 border-0 bg-transparent px-0 py-0">
            <PanelHeaderTitle className="normal-case tracking-normal text-base text-text-primary">
              Local environment
            </PanelHeaderTitle>
          </PanelHeader>
          <div className="mt-3 space-y-2">
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
        <Card className="border-emerald-200 bg-semantic-success-bg shadow-card">
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
