"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Alert } from "@/components/ui/Alert";
import type { QrFeatureDriver } from "@/lib/types";

const SUCCESS = "#059669";
const WARNING = "#d97706";

type Props = {
  drivers: QrFeatureDriver[];
};

function truncateLabel(label: string, max = 28): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

export function FeatureImportanceChart({ drivers }: Props) {
  if (!drivers.length) {
    return (
      <Alert variant="info">
        No quantile-regression drivers exported for this outlet.
      </Alert>
    );
  }

  const sorted = [...drivers].sort(
    (a, b) => Math.abs(b.contributionLiters) - Math.abs(a.contributionLiters)
  );

  const chartData = sorted.map((d) => ({
    label: truncateLabel(d.label),
    fullLabel: d.label,
    contribution: d.contributionLiters,
    direction: d.direction,
  }));

  const top = sorted[0];
  const ariaSummary = `Feature importance: top driver ${top.label}, contribution ${top.contributionLiters > 0 ? "+" : ""}${top.contributionLiters.toFixed(1)} liters`;

  const chartHeight = Math.max(220, Math.min(320, sorted.length * 36 + 48));

  return (
    <div
      className="w-full"
      style={{ height: chartHeight }}
      role="img"
      aria-label={ariaSummary}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: "#64748b", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
            tickFormatter={(v) => `${v}`}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tick={{ fill: "#475569", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
          />
          <Tooltip
            formatter={(value) => {
              const n = Number(value ?? 0);
              return [`${n > 0 ? "+" : ""}${n.toFixed(1)} L`, "Contribution"];
            }}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as { fullLabel?: string } | undefined;
              return row?.fullLabel ?? "";
            }}
            contentStyle={{
              borderRadius: "0.5rem",
              border: "1px solid #e2e8f0",
              fontSize: "0.875rem",
            }}
          />
          <Bar dataKey="contribution" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {chartData.map((entry) => (
              <Cell
                key={entry.fullLabel}
                fill={entry.direction === "up" ? SUCCESS : WARNING}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
