"use client";

import Link from "next/link";
import { Badge, saturationTone } from "@/components/ui/Badge";
import { Card, PanelHeader, PanelHeaderTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import type { OutletSortBy, SortDir } from "@/lib/filterPresets";
import type { Outlet } from "@/lib/types";

type Props = {
  rows: Outlet[];
  sortBy: OutletSortBy;
  sortDir: SortDir;
  compareIds: string[];
  onSortChange: (sortBy: OutletSortBy) => void;
  onToggleCompare: (id: string) => void;
};

function SortHeader({
  label,
  column,
  sortBy,
  sortDir,
  onSortChange,
  className = "",
}: {
  label: string;
  column: OutletSortBy;
  sortBy: OutletSortBy;
  sortDir: SortDir;
  onSortChange: (sortBy: OutletSortBy) => void;
  className?: string;
}) {
  const active = sortBy === column;
  const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th className={`px-4 py-3 ${className}`} aria-sort={ariaSort}>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-brand-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
        onClick={() => onSortChange(column)}
      >
        {label}
        {active ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );
}

function OutletCard({
  o,
  compareIds,
  onToggleCompare,
}: {
  o: Outlet;
  compareIds: string[];
  onToggleCompare: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/outlet/${o.id}`}
          className="font-semibold text-brand-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
        >
          {o.id}
        </Link>
        <label className="flex items-center gap-1 text-xs text-text-muted">
          <Checkbox
            checked={compareIds.includes(o.id)}
            onChange={() => onToggleCompare(o.id)}
            aria-label={`Compare ${o.id}`}
          />
          Compare
        </label>
      </div>
      {o.tradeSpendLkr > 0 && (
        <Badge tone="success" className="mt-2">
          LKR {o.tradeSpendLkr.toLocaleString()}
        </Badge>
      )}
      <p className="mt-1 text-xs text-text-muted">
        {o.province} · {o.distributorId}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-xs text-text-muted">Predicted</p>
          <p className="font-medium tabular-nums text-text-primary">{o.predictedLiters.toFixed(1)} L</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Gap</p>
          <p className="font-medium tabular-nums text-text-secondary">{o.gapLiters.toFixed(1)} L</p>
        </div>
      </div>
      <div className="mt-2">
        <Badge tone={saturationTone(o.marketSaturation)}>{o.marketSaturation || "—"}</Badge>
      </div>
    </div>
  );
}

export function OutletsTable({
  rows,
  sortBy,
  sortDir,
  compareIds,
  onSortChange,
  onToggleCompare,
}: Props) {
  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-16 text-center shadow-card">
        <p className="text-sm font-medium text-text-secondary">No outlets match your filters</p>
        <p className="mt-1 text-xs text-text-muted">Try clearing filters or broadening your search.</p>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-3 md:hidden">
        {rows.map((o) => (
          <OutletCard
            key={o.id}
            o={o}
            compareIds={compareIds}
            onToggleCompare={onToggleCompare}
          />
        ))}
      </div>

      <Card className="hidden overflow-hidden p-0 shadow-card md:block">
        <PanelHeader>
          <PanelHeaderTitle>Outlet directory</PanelHeaderTitle>
        </PanelHeader>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted/90 text-left text-xs text-text-secondary">
                <th className="px-3 py-3 w-10" scope="col">
                  <span className="sr-only">Compare</span>
                </th>
                <SortHeader
                  label="Outlet"
                  column="id"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSortChange={onSortChange}
                  className="sticky left-0 z-10 bg-surface-muted/95 backdrop-blur-sm sticky-col-shadow"
                />
                <th className="px-4 py-3">Province</th>
                <th className="px-4 py-3">Distributor</th>
                <SortHeader
                  label="Predicted (L)"
                  column="predictedLiters"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSortChange={onSortChange}
                  className="text-right"
                />
                <SortHeader
                  label="Gap (L)"
                  column="gapLiters"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSortChange={onSortChange}
                  className="text-right"
                />
                <th className="px-4 py-3">Saturation</th>
                <SortHeader
                  label="Spend (LKR)"
                  column="tradeSpendLkr"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSortChange={onSortChange}
                  className="text-right"
                />
              </tr>
            </thead>
            <tbody>
              {rows.map((o, i) => (
                <tr
                  key={o.id}
                  className={`border-b border-border-muted transition-colors hover:bg-semantic-success-bg/40 ${
                    i % 2 === 1 ? "bg-surface-muted/40" : "bg-surface-card"
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <Checkbox
                      checked={compareIds.includes(o.id)}
                      onChange={() => onToggleCompare(o.id)}
                      aria-label={`Compare ${o.id}`}
                    />
                  </td>
                  <td
                    className={`sticky left-0 z-10 px-4 py-2.5 backdrop-blur-sm sticky-col-shadow ${
                      i % 2 === 1 ? "bg-surface-muted/95" : "bg-surface-card/95"
                    }`}
                  >
                    <Link
                      href={`/outlet/${o.id}`}
                      className="font-medium text-brand-accent transition-colors hover:text-brand-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1"
                    >
                      {o.id}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">{o.province}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-text-muted">{o.distributorId}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-text-primary">
                    {o.predictedLiters.toFixed(1)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
                    {o.gapLiters.toFixed(1)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={saturationTone(o.marketSaturation)}>
                      {o.marketSaturation || "—"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {o.tradeSpendLkr > 0 ? (
                      <Badge tone="success">{o.tradeSpendLkr.toLocaleString()}</Badge>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
