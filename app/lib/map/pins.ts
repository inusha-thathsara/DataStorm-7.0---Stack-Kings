import type { Outlet } from "@/lib/types";

export const PROVINCE_MAP_COLORS: Record<string, string> = {
  Western: "#2563eb",
  Central: "#7c3aed",
  "North-Western": "#ea580c",
  Southern: "#0891b2",
};

/** Green = Western budget trade spend; otherwise province color */
export function pinColor(outlet: Outlet): string {
  if (outlet.tradeSpendLkr > 0) return "#059669";
  return PROVINCE_MAP_COLORS[outlet.province] || "#64748b";
}

export function provinceColor(province: string): string {
  return PROVINCE_MAP_COLORS[province] || "#64748b";
}
