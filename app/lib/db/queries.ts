import {
  applyScopeFilter,
  outletMatchesScope,
  type AppSession,
  type ScopeFilter,
} from "@/lib/auth/rbac";
import { getSession } from "@/lib/auth/session";
import { getDataSource, getSql, usePostgres } from "@/lib/db/client";
import {
  loadJsonGeneratedAt,
  loadJsonOptimizationSummary,
  loadJsonOutlets,
  loadJsonTotalCount,
} from "@/lib/db/jsonFallback";
import { rowToOutlet, type OutletRow } from "@/lib/db/row";
import { sampleOutletsForMap } from "@/lib/map/sample";
import type { OptimizationSummary, Outlet } from "@/lib/types";
import type postgres from "postgres";

export type OutletListParams = ScopeFilter & {
  search?: string;
  page?: number;
  pageSize?: number;
};

export type OutletListResult = {
  outlets: Outlet[];
  total: number;
  page: number;
  pageSize: number;
  dataSource: "postgres" | "json";
  generatedAt: string | null;
};

export type OutletStats = {
  outletCount: number;
  withSpendCount: number;
  avgPredicted: number;
  avgGap: number;
  totalSpend: number;
  highSaturationPct: number;
  highSaturationCount: number;
};

const OUTLET_SELECT = `
  id, predicted_liters, own_max_vol, gap_liters, recent_3m_avg,
  province, distributor_id, competitor_density, competitor_density_z,
  market_saturation, dbscan_zone, dbscan_is_core, cluster_id,
  cluster_ceiling, kmeans_ceiling, qr_ceiling, base_ensemble,
  adjusted_ceiling, jan_factor, seasonality_label, cooler_count,
  outlet_size, outlet_type, lat, lon, decay_transport, decay_food,
  decay_worship, decay_total, trade_spend_lkr, predicted_incremental_liters,
  dominant_method, adjustment_factor, model_drivers
`;

export type OutletAccessResult =
  | { kind: "found"; outlet: Outlet }
  | { kind: "not_found" }
  | { kind: "forbidden" };

async function resolveSession(session?: AppSession): Promise<AppSession> {
  return session ?? (await getSession());
}

function filterJsonOutlets(outlets: Outlet[], params: OutletListParams, session: AppSession): Outlet[] {
  const scope = applyScopeFilter(session, params);
  const search = params.search?.toLowerCase() ?? "";

  return outlets.filter((o) => {
    if (scope.province && o.province !== scope.province) return false;
    if (scope.distributorId && o.distributorId !== scope.distributorId) return false;
    if (scope.westernOnly && o.province !== "Western") return false;
    if (search && !o.id.toLowerCase().includes(search)) return false;
    return true;
  });
}

function resolveFilters(params: OutletListParams, session: AppSession) {
  const scope = applyScopeFilter(session, params);
  return {
    province: scope.province ?? null,
    distributorId: scope.distributorId ?? null,
    westernOnly: Boolean(scope.westernOnly),
    search: params.search?.trim() ? `%${params.search.trim().toLowerCase()}%` : null,
  };
}
function outletFilterSql(
  sql: ReturnType<typeof postgres>,
  f: ReturnType<typeof resolveFilters>
) {
  return sql`
    (${f.province}::text IS NULL OR province = ${f.province})
    AND (${f.distributorId}::text IS NULL OR distributor_id = ${f.distributorId})
    AND (NOT ${f.westernOnly} OR province = 'Western')
    AND (${f.search}::text IS NULL OR LOWER(id) LIKE ${f.search})
  `;
}

export async function getGeneratedAt(): Promise<string | null> {
  if (!usePostgres()) return loadJsonGeneratedAt();

  const sql = getSql();
  const rows = await sql`
    SELECT generated_at FROM export_runs ORDER BY generated_at DESC LIMIT 1
  `;
  const row = rows[0] as { generated_at?: Date | string } | undefined;
  if (!row?.generated_at) return null;
  return row.generated_at instanceof Date
    ? row.generated_at.toISOString()
    : String(row.generated_at);
}

export async function listOutlets(
  params: OutletListParams,
  session?: AppSession
): Promise<OutletListResult> {
  const activeSession = await resolveSession(session);
  const page = Math.max(0, params.page ?? 0);
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));
  const generatedAt = await getGeneratedAt();
  const dataSource = getDataSource();

  if (!usePostgres()) {
    const all = await loadJsonOutlets();
    const filtered = filterJsonOutlets(all, params, activeSession);
    const slice = filtered.slice(page * pageSize, (page + 1) * pageSize);
    return {
      outlets: slice,
      total: filtered.length,
      page,
      pageSize,
      dataSource,
      generatedAt,
    };
  }

  const sql = getSql();
  const f = resolveFilters(params, activeSession);
  const countRows = await sql`
    SELECT COUNT(*)::int AS count FROM outlets WHERE ${outletFilterSql(sql, f)}
  `;
  const total = (countRows[0] as { count: number }).count;
  const offset = page * pageSize;

  const rows = (await sql`
    SELECT ${sql.unsafe(OUTLET_SELECT)} FROM outlets
    WHERE ${outletFilterSql(sql, f)}
    ORDER BY id
    LIMIT ${pageSize} OFFSET ${offset}
  `) as OutletRow[];

  return {
    outlets: rows.map(rowToOutlet),
    total,
    page,
    pageSize,
    dataSource,
    generatedAt,
  };
}

export async function getOutletById(
  id: string,
  session?: AppSession
): Promise<Outlet | null> {
  const result = await getOutletAccess(id, session);
  return result.kind === "found" ? result.outlet : null;
}

export async function getOutletAccess(
  id: string,
  session?: AppSession
): Promise<OutletAccessResult> {
  const activeSession = await resolveSession(session);
  const scope = applyScopeFilter(activeSession, {});

  let outlet: Outlet | null = null;
  if (!usePostgres()) {
    const all = await loadJsonOutlets();
    outlet = all.find((o) => o.id === id) ?? null;
  } else {
    const sql = getSql();
    const rows = (await sql`
      SELECT ${sql.unsafe(OUTLET_SELECT)} FROM outlets WHERE id = ${id} LIMIT 1
    `) as OutletRow[];
    if (rows.length) outlet = rowToOutlet(rows[0]);
  }

  if (!outlet) return { kind: "not_found" };
  if (!outletMatchesScope(outlet, scope)) return { kind: "forbidden" };
  return { kind: "found", outlet };
}

export async function listOutletsForMap(
  params: OutletListParams,
  session?: AppSession
): Promise<{
  outlets: Outlet[];
  truncated: boolean;
  totalValid: number;
  dataSource: "postgres" | "json";
}> {
  const activeSession = await resolveSession(session);
  const dataSource = getDataSource();

  if (!usePostgres()) {
    const all = await loadJsonOutlets();
    const filtered = filterJsonOutlets(all, params, activeSession);
    const { sampled, totalValid, truncated } = sampleOutletsForMap(filtered);
    return { outlets: sampled, truncated, totalValid, dataSource };
  }

  const sql = getSql();
  const f = resolveFilters(params, activeSession);
  const rows = (await sql`
    SELECT ${sql.unsafe(OUTLET_SELECT)} FROM outlets
    WHERE ${outletFilterSql(sql, f)}
    ORDER BY id
  `) as OutletRow[];
  const outlets = rows.map(rowToOutlet);
  const { sampled, totalValid, truncated } = sampleOutletsForMap(outlets);
  return { outlets: sampled, truncated, totalValid, dataSource };
}

export async function getOutletMeta(
  params: ScopeFilter & { province?: string },
  session?: AppSession
): Promise<{
  provinces: string[];
  distributors: string[];
  totalCount: number;
}> {
  const activeSession = await resolveSession(session);

  if (!usePostgres()) {
    const all = await loadJsonOutlets();
    const filtered = filterJsonOutlets(all, { ...params }, activeSession);
    const provinces = [...new Set(filtered.map((o) => o.province).filter(Boolean))].sort();
    const pool = params.province
      ? filtered.filter((o) => o.province === params.province)
      : filtered;
    const distributors = [...new Set(pool.map((o) => o.distributorId).filter(Boolean))].sort();
    const scopedTotal = filtered.length;
    return { provinces, distributors, totalCount: scopedTotal };
  }

  const sql = getSql();
  const scope = applyScopeFilter(activeSession, params);
  const scopedF = resolveFilters({}, activeSession);
  const scopedCountRows = await sql`
    SELECT COUNT(*)::int AS count FROM outlets WHERE ${outletFilterSql(sql, scopedF)}
  `;
  const totalCount = (scopedCountRows[0] as { count: number }).count;

  const allProvRows = await sql`
    SELECT DISTINCT province FROM outlets WHERE province <> '' ORDER BY province
  `;
  let provinces = allProvRows.map((r) => (r as { province: string }).province);
  if (scope.province) provinces = provinces.filter((p) => p === scope.province);
  if (scope.westernOnly) provinces = provinces.filter((p) => p === "Western");

  const distScope = {
    ...scope,
    province: params.province ?? scope.province,
  };
  const distF = resolveFilters({ ...distScope }, activeSession);
  const distRows = await sql`
    SELECT DISTINCT distributor_id FROM outlets
    WHERE ${outletFilterSql(sql, distF)} AND distributor_id <> ''
    ORDER BY distributor_id
  `;
  const distributors = distRows.map((r) => (r as { distributor_id: string }).distributor_id);

  return { provinces, distributors, totalCount };
}

export async function getOutletStats(
  params: OutletListParams,
  session?: AppSession
): Promise<OutletStats> {
  const activeSession = await resolveSession(session);

  if (!usePostgres()) {
    const all = await loadJsonOutlets();
    const filtered = filterJsonOutlets(all, params, activeSession);
    return computeStats(filtered);
  }

  const sql = getSql();
  const f = resolveFilters(params, activeSession);
  const rows = await sql`
    SELECT
      COUNT(*)::int AS outlet_count,
      COUNT(*) FILTER (WHERE trade_spend_lkr > 0)::int AS with_spend_count,
      COALESCE(AVG(predicted_liters), 0) AS avg_predicted,
      COALESCE(AVG(gap_liters), 0) AS avg_gap,
      COALESCE(SUM(trade_spend_lkr), 0) AS total_spend,
      COUNT(*) FILTER (WHERE market_saturation = 'high')::int AS high_sat_count
    FROM outlets WHERE ${outletFilterSql(sql, f)}
  `;
  const r = rows[0] as {
    outlet_count: number;
    with_spend_count: number;
    avg_predicted: number;
    avg_gap: number;
    total_spend: number;
    high_sat_count: number;
  };
  const outletCount = r.outlet_count;
  return {
    outletCount,
    withSpendCount: r.with_spend_count,
    avgPredicted: Number(r.avg_predicted),
    avgGap: Number(r.avg_gap),
    totalSpend: Number(r.total_spend),
    highSaturationCount: r.high_sat_count,
    highSaturationPct: outletCount > 0 ? (100 * r.high_sat_count) / outletCount : 0,
  };
}

function computeStats(outlets: Outlet[]): OutletStats {
  const outletCount = outlets.length;
  if (outletCount === 0) {
    return {
      outletCount: 0,
      withSpendCount: 0,
      avgPredicted: 0,
      avgGap: 0,
      totalSpend: 0,
      highSaturationPct: 0,
      highSaturationCount: 0,
    };
  }
  const withSpend = outlets.filter((o) => o.tradeSpendLkr > 0);
  const highSat = outlets.filter((o) => o.marketSaturation === "high").length;
  return {
    outletCount,
    withSpendCount: withSpend.length,
    avgPredicted: outlets.reduce((s, o) => s + o.predictedLiters, 0) / outletCount,
    avgGap: outlets.reduce((s, o) => s + o.gapLiters, 0) / outletCount,
    totalSpend: withSpend.reduce((s, o) => s + o.tradeSpendLkr, 0),
    highSaturationCount: highSat,
    highSaturationPct: (100 * highSat) / outletCount,
  };
}

export async function getOptimizationSummary(): Promise<OptimizationSummary> {
  if (!usePostgres()) return loadJsonOptimizationSummary();

  const sql = getSql();
  const rows = await sql`SELECT metric, value FROM optimization_summary`;
  const summary: OptimizationSummary = {};
  for (const row of rows) {
    const r = row as { metric: string; value: string };
    summary[r.metric] = r.value;
  }
  return summary;
}

export async function checkDbHealth(): Promise<{
  ok: boolean;
  dataSource: "postgres" | "json";
  generatedAt: string | null;
  outletCount: number | null;
  error?: string;
}> {
  const dataSource = getDataSource();
  try {
    if (!usePostgres()) {
      const count = await loadJsonTotalCount();
      const generatedAt = await loadJsonGeneratedAt();
      return { ok: true, dataSource, generatedAt, outletCount: count };
    }
    const sql = getSql();
    const countRows = await sql`SELECT COUNT(*)::int AS count FROM outlets`;
    const generatedAt = await getGeneratedAt();
    return {
      ok: true,
      dataSource,
      generatedAt,
      outletCount: (countRows[0] as { count: number }).count,
    };
  } catch (err) {
    return {
      ok: false,
      dataSource,
      generatedAt: null,
      outletCount: null,
      error: err instanceof Error ? err.message : "Health check failed",
    };
  }
}
