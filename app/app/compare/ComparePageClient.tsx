"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CompareOutletPicker } from "@/components/compare/CompareOutletPicker";
import { ShareActions } from "@/components/ShareActions";
import { Badge, saturationTone } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, PanelHeader } from "@/components/ui/Card";
import { LoadingState, Skeleton } from "@/components/ui/Skeleton";
import {
  compareUrl,
  loadCompareIds,
  replaceCompareSlot,
  resolveComparePair,
  saveCompareIds,
} from "@/lib/compareSelection";
import type { Outlet } from "@/lib/types";

const PotentialVolumeChart = dynamic(
  () =>
    import("@/components/outlet/PotentialVolumeChart").then((m) => m.PotentialVolumeChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-48 w-full rounded-lg" />,
  }
);

const FeatureImportanceChart = dynamic(
  () =>
    import("@/components/outlet/FeatureImportanceChart").then((m) => m.FeatureImportanceChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-56 w-full rounded-lg" />,
  }
);

function CompareColumn({
  outlet,
  excludeId,
  onChange,
}: {
  outlet: Outlet;
  excludeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <Card className="shadow-card">
      <PanelHeader className="relative mb-0 border-b border-border-muted pb-3">
        <CompareOutletPicker value={outlet.id} excludeId={excludeId} onChange={onChange} />
      </PanelHeader>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-text-muted">Predicted</p>
            <p className="font-semibold tabular-nums">{outlet.predictedLiters.toFixed(1)} L</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Gap</p>
            <p className="font-semibold tabular-nums">{outlet.gapLiters.toFixed(1)} L</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Spend</p>
            <p className="font-semibold tabular-nums">
              {outlet.tradeSpendLkr > 0 ? `LKR ${outlet.tradeSpendLkr.toLocaleString()}` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Saturation</p>
            <Badge tone={saturationTone(outlet.marketSaturation)}>{outlet.marketSaturation || "—"}</Badge>
          </div>
        </div>
        <PotentialVolumeChart
          predictedLiters={outlet.predictedLiters}
          ownMaxVol={outlet.ownMaxVol}
          recent3mAvg={outlet.recent3mAvg}
          gapLiters={outlet.gapLiters}
          janFactor={outlet.janFactor}
          seasonalityLabel={outlet.seasonalityLabel}
        />
        <FeatureImportanceChart drivers={(outlet.modelDrivers?.qrTopDrivers ?? []).slice(0, 5)} />
      </div>
    </Card>
  );
}

function DiffRow({ a, b }: { a: Outlet; b: Outlet }) {
  const gapWinner = a.gapLiters >= b.gapLiters ? a.id : b.id;
  const spendWinner = a.tradeSpendLkr >= b.tradeSpendLkr ? a.id : b.id;
  return (
    <Card className="border-emerald-200 bg-semantic-success-bg/30 p-4 shadow-card">
      <p className="text-sm text-text-secondary">
        Higher gap: <strong>{gapWinner}</strong> · Higher trade spend:{" "}
        <strong>{a.tradeSpendLkr === b.tradeSpendLkr ? "tie" : spendWinner}</strong>
      </p>
    </Card>
  );
}

export default function ComparePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idA = searchParams.get("a")?.trim() ?? "";
  const idB = searchParams.get("b")?.trim() ?? "";
  const [storedIds, setStoredIds] = useState<string[] | null>(null);
  const pair = useMemo(
    () => (storedIds === null ? null : resolveComparePair(idA, idB, storedIds)),
    [idA, idB, storedIds]
  );
  const [outletA, setOutletA] = useState<Outlet | null>(null);
  const [outletB, setOutletB] = useState<Outlet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const changeSlot = useCallback(
    (slot: "a" | "b", newId: string) => {
      if (!pair || newId === (slot === "a" ? pair.a : pair.b)) return;
      const next = replaceCompareSlot(pair.a, pair.b, slot, newId);
      saveCompareIds([next.a, next.b]);
      router.replace(compareUrl(next.a, next.b));
    },
    [pair, router]
  );

  useEffect(() => {
    setStoredIds(loadCompareIds());
  }, []);

  useEffect(() => {
    if (storedIds === null) return;

    if (!pair) {
      setLoading(false);
      setError(null);
      setOutletA(null);
      setOutletB(null);
      return;
    }

    if (pair.a !== idA || pair.b !== idB) {
      saveCompareIds([pair.a, pair.b]);
      router.replace(compareUrl(pair.a, pair.b));
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/outlets/${encodeURIComponent(pair.a)}`),
      fetch(`/api/outlets/${encodeURIComponent(pair.b)}`),
    ])
      .then(async ([ra, rb]) => {
        if (!ra.ok || !rb.ok) throw new Error("One or both outlets could not be loaded.");
        const [ja, jb] = await Promise.all([ra.json(), rb.json()]);
        if (cancelled) return;
        setOutletA(ja.outlet);
        setOutletB(jb.outlet);
        saveCompareIds([pair.a, pair.b]);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pair, idA, idB, router, storedIds]);

  if (storedIds === null) {
    return <LoadingState message="Loading comparison…" />;
  }

  if (!pair) {
    const pending = idA || storedIds[0] || "";
    return (
      <div className="space-y-4">
        <Link href="/" className="text-sm font-medium text-brand-accent hover:underline">
          ← Back to browse
        </Link>
        <Alert variant="warning" title="Select a second outlet">
          {pending ? (
            <p>
              <strong>{pending}</strong> is ready to compare. Check another outlet in the table, then click{" "}
              <strong>Compare outlets</strong>.
            </p>
          ) : (
            <p>Check two outlets in the browse table, then click <strong>Compare outlets</strong>.</p>
          )}
        </Alert>
        <Link href={pending ? `/?compare=${encodeURIComponent(pending)}` : "/"}>
          <Button variant="primary" size="sm">
            Browse outlets
          </Button>
        </Link>
      </div>
    );
  }

  if (loading) return <LoadingState message="Loading comparison…" />;

  if (error || !outletA || !outletB) {
    return (
      <Alert variant="error" title="Compare unavailable">
        {error ?? "Outlets not found."}
      </Alert>
    );
  }

  return (
    <div className="space-y-4 print-area">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-sm font-medium text-brand-accent hover:underline">
            ← Back to browse
          </Link>
          <h1 className="mt-2 text-display-sm text-text-primary">Compare outlets</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm no-print">
            <CompareOutletPicker
              value={outletA.id}
              excludeId={outletB.id}
              onChange={(id) => changeSlot("a", id)}
            />
            <span className="text-text-muted">vs</span>
            <CompareOutletPicker
              value={outletB.id}
              excludeId={outletA.id}
              onChange={(id) => changeSlot("b", id)}
            />
          </div>
          <p className="mt-1 text-sm text-text-muted print:block hidden">
            {outletA.id} vs {outletB.id}
          </p>
        </div>
        <ShareActions className="no-print" />
      </div>

      <DiffRow a={outletA} b={outletB} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CompareColumn
          outlet={outletA}
          excludeId={outletB.id}
          onChange={(id) => changeSlot("a", id)}
        />
        <CompareColumn
          outlet={outletB}
          excludeId={outletA.id}
          onChange={(id) => changeSlot("b", id)}
        />
      </div>
    </div>
  );
}
