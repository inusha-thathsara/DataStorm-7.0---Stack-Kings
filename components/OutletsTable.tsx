import Link from "next/link";
import { Badge, saturationTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { Outlet } from "@/lib/types";

type Props = {
  rows: Outlet[];
};

export function OutletsTable({ rows }: Props) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              <th className="px-4 py-3">Outlet</th>
              <th className="px-4 py-3">Province</th>
              <th className="px-4 py-3">Distributor</th>
              <th className="px-4 py-3 text-right">Predicted (L)</th>
              <th className="px-4 py-3 text-right">Gap (L)</th>
              <th className="px-4 py-3">Saturation</th>
              <th className="px-4 py-3 text-right">Spend (LKR)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr
                key={o.id}
                className="border-b border-slate-100 transition-colors hover:bg-slate-50"
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={`/outlet/${o.id}`}
                    className="font-medium text-emerald-700 hover:text-emerald-900 hover:underline"
                  >
                    {o.id}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-slate-700">{o.province}</td>
                <td className="px-4 py-2.5 text-slate-600">{o.distributorId}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-900">
                  {o.predictedLiters.toFixed(1)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                  {o.gapLiters.toFixed(1)}
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={saturationTone(o.marketSaturation)}>
                    {o.marketSaturation || "—"}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {o.tradeSpendLkr > 0 ? (
                    <span className="font-medium text-emerald-700">
                      {o.tradeSpendLkr.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
