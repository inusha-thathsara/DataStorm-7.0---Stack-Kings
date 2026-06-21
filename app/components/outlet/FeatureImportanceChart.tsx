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
const ROW_HEIGHT = 52;

type Props = {
  drivers: QrFeatureDriver[];
  highlightFeature?: string | null;
};

function wrapLabel(label: string, maxLineLen = 22): string[] {
  if (label.length <= maxLineLen) return [label];
  const words = label.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLineLen) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

function estimateLabelWidth(labels: string[]): number {
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 0);
  return Math.min(240, Math.max(168, longest * 6.5 + 12));
}

function YAxisTick(props: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: string };
}) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const value = typeof props.payload?.value === "string" ? props.payload.value : "";
  const lines = wrapLabel(value);

  return (
    <text
      x={x}
      y={y}
      textAnchor="end"
      dominantBaseline="middle"
      fill="#475569"
      fontSize={12}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? (lines.length > 1 ? "-0.55em" : "0") : "1.15em"}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function FeatureImportanceChart({ drivers, highlightFeature }: Props) {
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
    label: d.label,
    feature: d.feature,
    contribution: d.contributionLiters,
    direction: d.direction,
  }));

  const top = sorted[0];
  const ariaSummary = `Feature importance: top driver ${top.label}, contribution ${top.contributionLiters > 0 ? "+" : ""}${top.contributionLiters.toFixed(1)} liters`;

  const labelWidth = estimateLabelWidth(sorted.map((d) => d.label));
  const chartHeight = Math.max(280, sorted.length * ROW_HEIGHT + 40);

  return (
    <div
      className="w-full min-h-[280px]"
      style={{ height: chartHeight }}
      role="img"
      aria-label={ariaSummary}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          barCategoryGap="24%"
          margin={{ top: 8, right: 20, left: 8, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: "#64748b", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
            tickFormatter={(v) => `${v}`}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={labelWidth}
            tick={YAxisTick}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
            interval={0}
          />
          <Tooltip
            formatter={(value) => {
              const n = Number(value ?? 0);
              return [`${n > 0 ? "+" : ""}${n.toFixed(1)} L`, "Contribution"];
            }}
            labelFormatter={(label) => String(label ?? "")}
            contentStyle={{
              borderRadius: "0.5rem",
              border: "1px solid #e2e8f0",
              fontSize: "0.875rem",
            }}
          />
          <Bar dataKey="contribution" radius={[0, 4, 4, 0]} maxBarSize={28}>
            {chartData.map((entry) => {
              const isHighlighted = highlightFeature === entry.feature;
              const base = entry.direction === "up" ? SUCCESS : WARNING;
              return (
                <Cell
                  key={entry.label}
                  fill={isHighlighted ? "#065f46" : base}
                  stroke={isHighlighted ? "#064e3b" : undefined}
                  strokeWidth={isHighlighted ? 2 : 0}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
