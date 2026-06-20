"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { MapLegend } from "@/components/map/MapLegend";
import type { Outlet } from "@/lib/types";
import { pinColor } from "@/lib/map/pins";
import { sampleOutletsForMap } from "@/lib/map/sample";
import type { MapMarker } from "@/lib/map/types";

const OsmMap = dynamic(() => import("./OsmMap").then((m) => m.OsmMap), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-surface-muted text-sm text-text-muted">
      Loading map…
    </div>
  ),
});

type Props = {
  outlets: Outlet[];
  highlightId?: string;
  provinceFilter?: string;
  /** Hide outlet detail links on single-outlet pages if needed */
  showDetailLinks?: boolean;
};

export function OutletMap({
  outlets,
  highlightId,
  provinceFilter = "",
  showDetailLinks = true,
}: Props) {
  const { markers, truncated, total, provinceCounts, pinCount } = useMemo(() => {
    const { sampled, totalValid, truncated: isTrunc, provinceCounts: counts } =
      sampleOutletsForMap(outlets);

    const mk: MapMarker[] = sampled.map((outlet) => ({
      outlet,
      position: [outlet.lat, outlet.lon],
      color: pinColor(outlet),
      highlighted: outlet.id === highlightId,
    }));

    return {
      markers: mk,
      truncated: isTrunc,
      total: totalValid,
      provinceCounts: counts,
      pinCount: mk.length,
    };
  }, [outlets, highlightId]);

  const mixLabel =
    !provinceFilter && truncated && Object.keys(provinceCounts).length > 1
      ? Object.entries(provinceCounts)
          .map(([p, n]) => `${p}: ${n}`)
          .join(", ")
      : "";

  if (outlets.length === 0) {
    return (
      <Card className="overflow-hidden p-0 shadow-card">
        <CardHeader className="panel-header">
          <CardTitle className="mb-0">Geographic overview</CardTitle>
        </CardHeader>
        <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
          <p className="text-sm font-medium text-text-secondary">No outlets to display on the map</p>
          <p className="mt-1 text-xs text-text-muted">Broaden your filters to see geographic distribution.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0 shadow-card">
      <CardHeader className="flex flex-col gap-2 panel-header sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="mb-0">Geographic overview</CardTitle>
          <p className="mt-0.5 text-xs text-text-muted">
            OpenStreetMap · green = optimized trade spend
          </p>
        </div>
        <div className="text-right text-xs text-text-muted">
          <p className="font-medium tabular-nums text-text-secondary">
            {pinCount.toLocaleString()} pins
            {truncated ? ` · sample of ${total.toLocaleString()}` : ""}
          </p>
          {mixLabel && <p className="mt-1 max-w-xs text-[10px] leading-snug">{mixLabel}</p>}
        </div>
      </CardHeader>

      <MapLegend provinceFilter={provinceFilter} />

      <div className="bg-surface-muted/50 p-3">
        <OsmMap markers={markers} showDetailLinks={showDetailLinks} />
      </div>
    </Card>
  );
}
