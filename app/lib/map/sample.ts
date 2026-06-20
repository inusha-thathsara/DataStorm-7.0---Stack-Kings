import type { Outlet } from "@/lib/types";
import { isValidOutletCoord } from "./bounds";

/** Max pins when one province is selected */
const MAX_MAP_POINTS_SINGLE = 2500;
/** Higher cap when all provinces shown */
const MAX_MAP_POINTS_MULTI = 12_000;

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function deterministicSample(outlets: Outlet[], n: number): Outlet[] {
  if (outlets.length <= n) return outlets;
  return [...outlets].sort((a, b) => hashId(a.id) - hashId(b.id)).slice(0, n);
}

function proportionalTakeCounts(
  byProvince: Map<string, Outlet[]>,
  provinces: string[],
  totalValid: number,
  cap: number
): Map<string, number> {
  const takes = new Map<string, number>();
  let assigned = 0;

  for (const prov of provinces) {
    const pool = byProvince.get(prov) || [];
    const n = Math.min(pool.length, Math.round((cap * pool.length) / totalValid));
    takes.set(prov, n);
    assigned += n;
  }

  let delta = cap - assigned;
  const order = [...provinces].sort(
    (a, b) => (byProvince.get(b)?.length ?? 0) - (byProvince.get(a)?.length ?? 0)
  );

  while (delta !== 0) {
    let moved = false;
    for (const prov of delta > 0 ? order : [...order].reverse()) {
      const pool = byProvince.get(prov) || [];
      const cur = takes.get(prov) ?? 0;
      if (delta > 0 && cur < pool.length) {
        takes.set(prov, cur + 1);
        delta -= 1;
        moved = true;
        break;
      }
      if (delta < 0 && cur > 0) {
        takes.set(prov, cur - 1);
        delta += 1;
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }

  return takes;
}

export function sampleOutletsForMap(outlets: Outlet[]): {
  sampled: Outlet[];
  totalValid: number;
  truncated: boolean;
  provinceCounts: Record<string, number>;
} {
  const valid = outlets.filter((o) => isValidOutletCoord(o.lat, o.lon));
  const totalValid = valid.length;
  if (totalValid === 0) {
    return { sampled: [], totalValid: 0, truncated: false, provinceCounts: {} };
  }

  const byProvince = new Map<string, Outlet[]>();
  for (const o of valid) {
    const list = byProvince.get(o.province) || [];
    list.push(o);
    byProvince.set(o.province, list);
  }

  const provinces = [...byProvince.keys()].sort();
  const multiProvince = provinces.length > 1;
  const cap = Math.min(
    totalValid,
    multiProvince ? MAX_MAP_POINTS_MULTI : MAX_MAP_POINTS_SINGLE
  );

  if (totalValid <= cap) {
    const provinceCounts: Record<string, number> = {};
    for (const o of valid) {
      provinceCounts[o.province] = (provinceCounts[o.province] || 0) + 1;
    }
    return { sampled: valid, totalValid, truncated: false, provinceCounts };
  }

  const sampled: Outlet[] = [];

  if (!multiProvince) {
    sampled.push(...deterministicSample(valid, cap));
  } else {
    const takes = proportionalTakeCounts(byProvince, provinces, totalValid, cap);
    for (const prov of provinces) {
      const pool = byProvince.get(prov) || [];
      const n = takes.get(prov) ?? 0;
      if (n > 0) sampled.push(...deterministicSample(pool, n));
    }
  }

  const provinceCounts: Record<string, number> = {};
  for (const o of sampled) {
    provinceCounts[o.province] = (provinceCounts[o.province] || 0) + 1;
  }

  return { sampled, totalValid, truncated: true, provinceCounts };
}
