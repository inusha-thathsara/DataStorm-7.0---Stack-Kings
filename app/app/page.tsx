"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { FilterBar } from "@/components/FilterBar";
import { OptimizationBanner } from "@/components/OptimizationBanner";
import { OutletsTable } from "@/components/OutletsTable";
import { QuickStats } from "@/components/QuickStats";
import { Alert } from "@/components/ui/Alert";
import { LoadingState } from "@/components/ui/Skeleton";
import { Pagination } from "@/components/ui/Pagination";
import { filterQueryString } from "@/lib/api/params";
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

export default function HomePage() {
  const [userScope, setUserScope] = useState<UserScope | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [pageRows, setPageRows] = useState<Outlet[]>([]);
  const [mapOutlets, setMapOutlets] = useState<Outlet[]>([]);
  const [stats, setStats] = useState<OutletStats | null>(null);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [province, setProvince] = useState("");
  const [distributor, setDistributor] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [westernOnly, setWesternOnly] = useState(false);

  const loadMeta = useCallback(async (prov?: string) => {
    const q = prov ? `?province=${encodeURIComponent(prov)}` : "";
    const r = await fetch(`/api/outlets/meta${q}`);
    if (!r.ok) throw new Error(`Meta HTTP ${r.status}`);
    return r.json() as Promise<Meta>;
  }, []);

  const loadData = useCallback(async () => {
    setLoadError(null);
    const filterParams = {
      province: province || undefined,
      distributorId: distributor || undefined,
      westernOnly,
      search: search || undefined,
    };
    const base = filterQueryString(filterParams);
    const listQs = `${base}${base ? "&" : ""}page=${page}&pageSize=${PAGE_SIZE}`;
    const [listRes, mapRes, statsRes] = await Promise.all([
      fetch(`/api/outlets?${listQs}`),
      fetch(`/api/outlets/map?${base}`),
      fetch(`/api/outlets/stats?${base}`),
    ]);

    if (!listRes.ok) throw new Error(`List HTTP ${listRes.status}`);
    if (!mapRes.ok) throw new Error(`Map HTTP ${mapRes.status}`);
    if (!statsRes.ok) throw new Error(`Stats HTTP ${statsRes.status}`);

    const listJson = await listRes.json();
    const mapJson = await mapRes.json();
    const statsJson = await statsRes.json();

    setPageRows(listJson.outlets ?? []);
    setFilteredTotal(listJson.total ?? 0);
    setMapOutlets(mapJson.outlets ?? []);
    setStats(statsJson);
  }, [province, distributor, westernOnly, search, page]);

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
    if (userScope?.lockProvinceFilter) {
      setProvince("Western");
      setWesternOnly(true);
    }
  }, [userScope?.lockProvinceFilter]);

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
    setLoading(true);
    loadData()
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message || "Failed to load outlets");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const totalPages = Math.ceil(filteredTotal / PAGE_SIZE) || 1;

  if (loadError && !meta) {
    return (
      <Alert title="Could not load outlet data" variant="error">
        <p>{loadError}</p>
        <p className="mt-3">
          Ensure <code className="rounded bg-red-100 px-1">outlets.json</code> exists or set{" "}
          <code className="rounded bg-red-100 px-1">DATABASE_URL</code> and run{" "}
          <code className="rounded bg-red-100 px-1">phase6b_load_postgres.py</code>.
        </p>
      </Alert>
    );
  }

  if (!meta && loading) {
    return <LoadingState message="Loading outlet data…" />;
  }

  return (
    <div className="space-y-4">
      <OptimizationBanner />

      <QuickStats stats={stats} loading={loading && !stats} />

      <section aria-label="Geographic filters and map" className="space-y-3">
        <FilterBar
          provinces={meta?.provinces ?? []}
          distributors={meta?.distributors ?? []}
          province={province}
          distributor={distributor}
          westernOnly={westernOnly}
          search={search}
          filteredCount={filteredTotal}
          totalCount={meta?.totalCount ?? 0}
          hideWesternScope={userScope?.hideWesternScopeToggle ?? false}
          lockProvinceFilter={userScope?.lockProvinceFilter ?? false}
          onProvinceChange={(v) => {
            setProvince(v);
            setDistributor("");
            setPage(0);
          }}
          onDistributorChange={(v) => {
            setDistributor(v);
            setPage(0);
          }}
          onWesternOnlyChange={(checked) => {
            setWesternOnly(checked);
            setPage(0);
          }}
          onSearchChange={(v) => {
            setSearch(v);
            setPage(0);
          }}
        />

        <OutletMap outlets={mapOutlets} provinceFilter={province} />
      </section>

      {loading && pageRows.length === 0 ? (
        <LoadingState message="Loading table…" />
      ) : (
        <OutletsTable rows={pageRows} />
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        pageSize={PAGE_SIZE}
        totalItems={filteredTotal}
        onPrevious={() => setPage((p) => p - 1)}
        onNext={() => setPage((p) => p + 1)}
      />
    </div>
  );
}
