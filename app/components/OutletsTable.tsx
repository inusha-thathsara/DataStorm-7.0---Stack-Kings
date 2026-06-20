import Link from "next/link";
import { Badge, saturationTone } from "@/components/ui/Badge";
import { Card, PanelHeader, PanelHeaderTitle } from "@/components/ui/Card";
import type { Outlet } from "@/lib/types";

type Props = {
  rows: Outlet[];
};

function OutletCard({ o }: { o: Outlet }) {
  return (
    <Link
      href={`/outlet/${o.id}`}
      className="block rounded-lg border border-border bg-surface-card p-4 shadow-card transition-colors hover:border-emerald-300 hover:bg-semantic-success-bg/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-brand-accent">{o.id}</p>
        {o.tradeSpendLkr > 0 && (
          <Badge tone="success">LKR {o.tradeSpendLkr.toLocaleString()}</Badge>
        )}
      </div>
      <p className="mt-1 text-xs text-text-muted">{o.province} · {o.distributorId}</p>
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
    </Link>
  );
}

export function OutletsTable({ rows }: Props) {
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
      {/* Mobile card layout */}
      <div className="grid gap-3 md:hidden">
        {rows.map((o) => (
          <OutletCard key={o.id} o={o} />
        ))}
      </div>

      {/* Desktop table */}
      <Card className="hidden overflow-hidden p-0 shadow-card md:block">
        <PanelHeader>
          <PanelHeaderTitle>Outlet directory</PanelHeaderTitle>
        </PanelHeader>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted/90 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
                <th className="sticky left-0 z-10 bg-surface-muted/95 px-4 py-3 backdrop-blur-sm sticky-col-shadow">
                  Outlet
                </th>
                <th className="px-4 py-3">Province</th>
                <th className="px-4 py-3">Distributor</th>
                <th className="px-4 py-3 text-right">Predicted (L)</th>
                <th className="px-4 py-3 text-right">Gap (L)</th>
                <th className="px-4 py-3">Saturation</th>
                <th className="px-4 py-3 text-right">Spend (LKR)</th>
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
