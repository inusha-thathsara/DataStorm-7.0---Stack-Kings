"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import type { Outlet } from "@/lib/types";
import { projectLatLon } from "@/lib/mapCoords";
import {
  pinColor,
  provinceColor,
  PROVINCE_MAP_COLORS,
  sampleOutletsForMap,
} from "@/lib/mapSample";

const MAP_W = 720;
const MAP_H = 420;

type Props = {
  outlets: Outlet[];
  highlightId?: string;
  provinceFilter?: string;
};

export function OutletMap({ outlets, highlightId, provinceFilter = "" }: Props) {
  const singleProvince = Boolean(provinceFilter);

  const { points, truncated, total, provinceCounts } = useMemo(() => {
    const { sampled, totalValid, truncated: isTrunc, provinceCounts: counts } =
      sampleOutletsForMap(outlets);

    const pts = sampled
      .map((o) => {
        const p = projectLatLon(o.lat, o.lon, MAP_W, MAP_H);
        if (!p) return null;
        return {
          id: o.id,
          x: p.x,
          y: p.y,
          fill: pinColor(o),
          highlight: o.id === highlightId,
        };
      })
      .filter(Boolean) as {
      id: string;
      x: number;
      y: number;
      fill: string;
      highlight: boolean;
    }[];

    return {
      points: pts,
      truncated: isTrunc,
      total: totalValid,
      provinceCounts: counts,
    };
  }, [outlets, highlightId]);

  const mixLabel =
    !singleProvince && truncated && Object.keys(provinceCounts).length > 1
      ? Object.entries(provinceCounts)
          .map(([p, n]) => `${p}: ${n}`)
          .join(", ")
      : "";

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <CardTitle>Map overview</CardTitle>
        <div className="text-right text-xs text-slate-500">
          <p>
            {points.length.toLocaleString()} pins
            {truncated
              ? ` (sample of ${total.toLocaleString()} geocoded)`
              : ""}
          </p>
          {mixLabel && <p className="mt-1">{mixLabel}</p>}
        </div>
      </CardHeader>

      <div className="mb-3 flex flex-wrap gap-2">
        {singleProvince ? (
          <Badge tone="default">
            <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: provinceColor(provinceFilter) }} />
            {provinceFilter}
          </Badge>
        ) : (
          Object.entries(PROVINCE_MAP_COLORS).map(([name, color]) => (
            <Badge key={name} tone="muted">
              <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: color }} />
              {name}
            </Badge>
          ))
        )}
        <Badge tone="success">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-600" />
          Western trade spend
        </Badge>
      </div>

      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        width="100%"
        className="max-h-[420px] rounded-md border border-slate-200 bg-slate-100"
        role="img"
        aria-label={
          provinceFilter
            ? `Outlet locations in ${provinceFilter} province`
            : "Outlet locations in Sri Lanka by province"
        }
      >
        {points.map((p) => (
          <circle
            key={p.id}
            cx={p.x}
            cy={p.y}
            r={p.highlight ? 5 : 2.5}
            fill={p.highlight ? "#dc2626" : p.fill}
            fillOpacity={p.highlight ? 1 : 0.6}
            stroke={p.highlight ? "#fff" : "none"}
            strokeWidth={p.highlight ? 1.5 : 0}
          />
        ))}
      </svg>
    </Card>
  );
}
