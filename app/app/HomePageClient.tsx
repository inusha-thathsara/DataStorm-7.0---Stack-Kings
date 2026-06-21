"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CompareBar, FilterBar } from "@/components/FilterBar";
import { OptimizationBanner } from "@/components/OptimizationBanner";
import { OutletsTable } from "@/components/OutletsTable";
import { QuickStats } from "@/components/QuickStats";
import { Alert } from "@/components/ui/Alert";
import { LoadingState } from "@/components/ui/Skeleton";
import { Pagination } from "@/components/ui/Pagination";
import { filterQueryString } from "@/lib/api/params";
import { loadCompareIds, saveCompareIds, toggleCompareId } from "@/lib/compareSelection";
import type { FilterPreset, OutletSortBy, SortDir } from "@/lib/filterPresets";
import type { UserScope } from "@/lib/auth/rbac";
import type { OutletStats } from "@/lib/db/queries";
import type { Outlet } from "@/lib/types";

const OutletMap = dynamic(
  () => import("@/components/OutletMap").then((m) => m.OutletMap),
  { ssr: false, loading: () => <LoadingState message="Loading map…" /> }
);

const PAGE_SIZE = 50;

type Meta = {
  provinces: string[];
  distributors: string[];
  totalCount: number;
};

type MeResponse = {
  scope: UserScope;
};

function readSortBy(raw: string | null): OutletSortBy {
  if (raw === "gapLiters" || raw === "predictedLiters" || raw === "tradeSpendLkr") return raw;
  return "id";
}

function readSortDir(raw: string | null): SortDir {
  if (raw === "desc") return "desc";
  return "asc";
}

export default function HomePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userScope, setUserScope] = useState<UserScope | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [pageRows, setPageRows] = useState<Outlet[]>([]);
  const [mapOutlets, setMapOutlets] = useState<Outlet[]>([]);
  const [stats, setStats] = useState<OutletStats | null>(null);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tableLoading, setTableLoading] = useState(true);
  const [mapLoading, setMapLoading] = useState(true);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const province = searchParams.get("province") ?? "";
  const distributor = searchParams.get("distributor") ?? "";
  const search = searchParams.get("search") ?? "";
  const westernOnly = searchParams.get("westernOnly") === "true";
  const highSaturationOnly = searchParams.get("highSaturationOnly") === "true";
  const hasTradeSpendOnly = searchParams.get("hasTradeSpendOnly") === "true";
  const sortBy = readSortBy(searchParams.get("sortBy"));
  const sortDir = readSortDir(searchParams.get("sortDir"));
  const page = Number(searchParams.get("page") ?? "0") || 0;

  const pushFilters = useCallback(
    (patch: Record<string, string | number | boolean | undefined>) => {
      const q = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === "" || value === false) q.delete(key);
        else q.set(key, String(value));
      }
      router.replace(`/?${q.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  useEffect(() => {
    const slot = searchParams.get("compare")?.trim();
    if (slot) {
      saveCompareIds([slot]);
      setCompareIds([slot]);
      const q = new URLSearchParams(searchParams.toString());
      q.delete("compare");
      const next = q.toString() ? `/?${q.toString()}` : "/";
      router.replace(next, { scroll: false });
      return;
    }
    setCompareIds(loadCompareIds());
  }, [searchParams, router]);

  const loadMeta = useCallback(async (prov?: string) => {
    const q = prov ? `?province=${encodeURIComponent(prov)}` : "";
    const r = await fetch(`/api/outlets/meta${q}`);
    if (!r.ok) throw new Error(`Meta HTTP ${r.status}`);
    return r.json() as Promise<Meta>;
  }, []);

  const loadTable = useCallback(async () => {
    const listParams = {
      province: province || undefined,
      distributorId: distributor || undefined,
      westernOnly,
      search: search || undefined,
      sortBy,
      sortDir,
      highSaturationOnly,
      hasTradeSpendOnly,
      page,
      pageSize: PAGE_SIZE,
    };
    const listQs = filterQueryString(listParams);
    const listRes = await fetch(`/api/outlets?${listQs}`);
    if (!listRes.ok) throw new Error(`List HTTP ${listRes.status}`);
    const listJson = await listRes.json();
    setPageRows(listJson.outlets ?? []);
    setFilteredTotal(listJson.total ?? 0);
  }, [
    province,
    distributor,
    westernOnly,
    search,
    sortBy,
    sortDir,
    highSaturationOnly,
    hasTradeSpendOnly,
    page,
  ]);

  const loadMapAndStats = useCallback(async () => {
    const mapParams = {
      province: province || undefined,
      distributorId: distributor || undefined,
      westernOnly,
      search: search || undefined,
      highSaturationOnly,
      hasTradeSpendOnly,
    };
    const mapQs = filterQueryString(mapParams);
    const [mapRes, statsRes] = await Promise.all([
      fetch(`/api/outlets/map?${mapQs}`),
      fetch(`/api/outlets/stats?${mapQs}`),
    ]);

    if (!mapRes.ok) throw new Error(`Map HTTP ${mapRes.status}`);
    if (!statsRes.ok) throw new Error(`Stats HTTP ${statsRes.status}`);

    const mapJson = await mapRes.json();
    const statsJson = await statsRes.json();
    setMapOutlets(mapJson.outlets ?? []);
    setStats(statsJson);
  }, [province, distributor, westernOnly, search, highSaturationOnly, hasTradeSpendOnly]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: MeResponse | null) => {
        if (!cancelled && data?.scope) setUserScope(data.scope);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!userScope?.lockProvinceFilter) return;
    if (province === "Western" && westernOnly) return;
    pushFilters({ province: "Western", westernOnly: true, page: 0 });
  }, [userScope?.lockProvinceFilter, province, westernOnly, pushFilters]);

  useEffect(() => {
    let cancelled = false;
    loadMeta(province || undefined)
      .then((m) => {
        if (!cancelled) setMeta(m);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message || "Failed to load meta");
      });
    return () => {
      cancelled = true;
    };
  }, [province, loadMeta]);

  useEffect(() => {
    let cancelled = false;
    setTableLoading(true);
    setLoadError(null);
    loadTable()
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message || "Failed to load outlets");
      })
      .finally(() => {
        if (!cancelled) setTableLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadTable]);

  useEffect(() => {
    let cancelled = false;
    setMapLoading(true);
    loadMapAndStats()
      .catch((err: Error) => {
        if (!cancelled) setLoadError((prev) => prev ?? err.message ?? "Failed to load map data");
      })
      .finally(() => {
        if (!cancelled) setMapLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadMapAndStats]);

  const totalPages = Math.ceil(filteredTotal / PAGE_SIZE) || 1;

  function handleToggleCompare(id: string) {
    const next = toggleCompareId(id);
    setCompareIds(next);
  }

  function handleApplyPreset(preset: FilterPreset) {
    pushFilters({
      province: preset.province,
      distributor: preset.distributor,
      westernOnly: preset.westernOnly,
      search: preset.search,
      sortBy: preset.sortBy,
      sortDir: preset.sortDir,
      highSaturationOnly: preset.highSaturationOnly,
      hasTradeSpendOnly: preset.hasTradeSpendOnly,
      page: 0,
    });
  }

  function handleSortChange(column: OutletSortBy) {
    if (sortBy !== column) {
      pushFilters({
        sortBy: column,
        sortDir: column === "id" ? "asc" : "desc",
        page: 0,
      });
      return;
    }
    const nextDir = sortDir === "desc" ? "asc" : "desc";
    pushFilters({ sortBy: column, sortDir: nextDir, page: 0 });
  }

  if (loadError && !meta) {
    return (
      <Alert title="Could not load outlet data" variant="error">
        <p>{loadError}</p>
      </Alert>
    );
  }

  if (!meta && tableLoading) {
    return <LoadingState message="Loading outlet data…" />;
  }

  return (
    <div className="space-y-4">
      <OptimizationBanner />
      <QuickStats stats={stats} loading={mapLoading && !stats} />

      {compareIds.length === 1 && (
        <Alert variant="info" title="Compare mode">
          Select one more outlet in the table to compare with <strong>{compareIds[0]}</strong>.
        </Alert>
      )}

      <section aria-label="Geographic filters and map" className="space-y-3">
        <FilterBar
          provinces={meta?.provinces ?? []}
          distributors={meta?.distributors ?? []}
          province={province}
          distributor={distributor}
          westernOnly={westernOnly}
          search={search}
          sortBy={sortBy}
          sortDir={sortDir}
          highSaturationOnly={highSaturationOnly}
          hasTradeSpendOnly={hasTradeSpendOnly}
          filteredCount={filteredTotal}
          totalCount={meta?.totalCount ?? 0}
          hideWesternScope={userScope?.hideWesternScopeToggle ?? false}
          lockProvinceFilter={userScope?.lockProvinceFilter ?? false}
          onProvinceChange={(v) => pushFilters({ province: v, distributor: "", page: 0 })}
          onDistributorChange={(v) => pushFilters({ distributor: v, page: 0 })}
          onWesternOnlyChange={(checked) => pushFilters({ westernOnly: checked, page: 0 })}
          onSearchChange={(v) => pushFilters({ search: v, page: 0 })}
          onSortByChange={(v) => pushFilters({ sortBy: v, page: 0 })}
          onSortDirChange={(v) => pushFilters({ sortDir: v, page: 0 })}
          onHighSaturationOnlyChange={(checked) =>
            pushFilters({ highSaturationOnly: checked, page: 0 })
          }
          onHasTradeSpendOnlyChange={(checked) =>
            pushFilters({ hasTradeSpendOnly: checked, page: 0 })
          }
          onApplyPreset={handleApplyPreset}
        />

        <CompareBar
          selectedIds={compareIds}
          onClear={() => {
            saveCompareIds([]);
            setCompareIds([]);
          }}
        />

        <OutletMap outlets={mapOutlets} provinceFilter={province} />
      </section>

      {tableLoading && pageRows.length === 0 ? (
        <LoadingState message="Loading table…" />
      ) : (
        <OutletsTable
          rows={pageRows}
          sortBy={sortBy}
          sortDir={sortDir}
          compareIds={compareIds}
          onSortChange={handleSortChange}
          onToggleCompare={handleToggleCompare}
        />
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        pageSize={PAGE_SIZE}
        totalItems={filteredTotal}
        onPrevious={() => pushFilters({ page: Math.max(0, page - 1) })}
        onNext={() => pushFilters({ page: page + 1 })}
      />
    </div>
  );
}
