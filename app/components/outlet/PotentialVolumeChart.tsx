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
import type { Outlet } from "@/lib/types";

type Props = Pick<
  Outlet,
  "predictedLiters" | "ownMaxVol" | "recent3mAvg" | "gapLiters" | "janFactor" | "seasonalityLabel"
>;

const ACCENT = "#059669";
const MUTED = "#94a3b8";

function formatLiters(v: number): string {
  return `${v.toFixed(1)} L`;
}

export function PotentialVolumeChart({
  predictedLiters,
  ownMaxVol,
  recent3mAvg,
  gapLiters,
  janFactor,
  seasonalityLabel,
}: Props) {
  const data = [
    { name: "Recent 3m avg", liters: recent3mAvg, highlight: false },
    { name: "Historical max", liters: ownMaxVol, highlight: false },
    { name: "Predicted (Jan 2026)", liters: predictedLiters, highlight: true },
  ];

  const topDriver = `Predicted ${predictedLiters.toFixed(1)} L vs historical max ${ownMaxVol.toFixed(1)} L`;

  return (
    <div>
      <p className="text-2xl font-bold tabular-nums text-brand-accent">
        {predictedLiters.toFixed(1)} L
        <span className="ml-1 text-sm font-normal text-text-muted">/ month (Jan 2026)</span>
      </p>
      <p className="mt-1 text-xs text-text-muted">
        Gap {gapLiters.toFixed(1)} L · Jan factor {janFactor.toFixed(3)} ·{" "}
        {seasonalityLabel || "—"}
      </p>
      <div
        className="mt-4 h-[240px] w-full"
        role="img"
        aria-label={`Volume comparison chart. ${topDriver}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
              interval={0}
              angle={-12}
              textAnchor="end"
              height={56}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
              tickFormatter={(v) => `${v}`}
              width={48}
            />
            <Tooltip
              formatter={(value) => [
                formatLiters(Number(value ?? 0)),
                "Volume",
              ]}
              contentStyle={{
                borderRadius: "0.5rem",
                border: "1px solid #e2e8f0",
                fontSize: "0.875rem",
              }}
            />
            <Bar dataKey="liters" radius={[4, 4, 0, 0]} maxBarSize={56}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.highlight ? ACCENT : MUTED} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
