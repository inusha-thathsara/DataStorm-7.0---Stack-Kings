import { Card, PanelHeader, PanelHeaderTitle } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import type { OutletStats } from "@/lib/db/queries";

type Props = {
  stats: OutletStats | null;
  loading?: boolean;
};

export function QuickStats({ stats, loading }: Props) {
  if (loading) {
    return (
      <Card className="mb-4 p-0 shadow-card">
        <PanelHeader>
          <PanelHeaderTitle>Filtered snapshot</PanelHeaderTitle>
        </PanelHeader>
        <div className="px-4 py-4 text-sm text-text-muted">Loading stats…</div>
      </Card>
    );
  }

  if (!stats || stats.outletCount === 0) {
    return (
      <Card className="mb-4 p-0 shadow-card">
        <PanelHeader>
          <PanelHeaderTitle>Filtered snapshot</PanelHeaderTitle>
        </PanelHeader>
        <div className="px-4 pb-4 pt-1">
          <p className="text-sm text-text-secondary">No outlets in the current filter.</p>
          <p className="mt-0.5 text-xs text-text-muted">Adjust filters to see aggregate stats.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className="mb-4 border-border/80 bg-surface-card/90 p-0 shadow-card backdrop-blur-sm"
      aria-live="polite"
      aria-atomic="true"
    >
      <PanelHeader>
        <PanelHeaderTitle>Filtered snapshot</PanelHeaderTitle>
      </PanelHeader>
      <div className="flex flex-col sm:flex-row sm:flex-wrap">
        <Stat
          label="Outlets"
          value={stats.outletCount.toLocaleString()}
          hint={`${stats.withSpendCount.toLocaleString()} with trade spend`}
          variant="light"
        />
        <Stat
          label="Avg predicted"
          value={`${stats.avgPredicted.toFixed(0)} L`}
          hint="Jan 2026 ceiling"
          accent="emerald"
          variant="light"
        />
        <Stat
          label="Avg gap"
          value={`${stats.avgGap.toFixed(0)} L`}
          hint="Headroom vs recent 3m"
          variant="light"
        />
        <Stat
          label="Budget deployed"
          value={
            stats.totalSpend > 0 ? `LKR ${(stats.totalSpend / 1_000_000).toFixed(2)}M` : "—"
          }
          hint={
            stats.withSpendCount > 0
              ? `${stats.withSpendCount} outlets funded`
              : "No spend in view"
          }
          accent={stats.totalSpend > 0 ? "emerald" : "default"}
          variant="light"
        />
        <Stat
          label="High saturation"
          value={`${stats.highSaturationPct.toFixed(0)}%`}
          hint={`${stats.highSaturationCount.toLocaleString()} outlets`}
          accent="blue"
          variant="light"
        />
      </div>
    </Card>
  );
}
