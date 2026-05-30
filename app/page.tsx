"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { FilterBar } from "@/components/FilterBar";
import { OptimizationBanner } from "@/components/OptimizationBanner";
import { OutletsTable } from "@/components/OutletsTable";
import { Alert } from "@/components/ui/Alert";
import { LoadingState } from "@/components/ui/Skeleton";
import { Pagination } from "@/components/ui/Pagination";
import type { OutletsData } from "@/lib/types";

const OutletMap = dynamic(
  () => import("@/components/OutletMap").then((m) => m.OutletMap),
  { ssr: false, loading: () => <LoadingState message="Loading map…" /> }
);

const PAGE_SIZE = 50;

export default function HomePage() {
  const [data, setData] = useState<OutletsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [province, setProvince] = useState("");
  const [distributor, setDistributor] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [westernOnly, setWesternOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    fetch("/data/outlets.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} loading outlets.json`);
        return r.json();
      })
      .then((json: OutletsData) => {
        if (cancelled) return;
        if (!json?.outlets?.length) {
          throw new Error("outlets.json is empty — run: py -3.12 src/phase6_export_app_data.py");
        }
        setData(json);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message || "Failed to load outlet data");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const provinces = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.outlets.map((o) => o.province).filter(Boolean))].sort();
  }, [data]);

  const distributors = useMemo(() => {
    if (!data) return [];
    const filtered = province
      ? data.outlets.filter((o) => o.province === province)
      : data.outlets;
    return [...new Set(filtered.map((o) => o.distributorId).filter(Boolean))].sort();
  }, [data, province]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.outlets.filter((o) => {
      if (province && o.province !== province) return false;
      if (distributor && o.distributorId !== distributor) return false;
      if (westernOnly && o.province !== "Western") return false;
      if (search && !o.id.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data, province, distributor, search, westernOnly]);

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;

  if (loadError) {
    return (
      <Alert title="Could not load outlet data">
        <p>{loadError}</p>
        <p className="mt-3 text-red-800">
          Stop the dev server (Ctrl+C), then from the <code className="rounded bg-red-100 px-1">app</code>{" "}
          folder run <code className="rounded bg-red-100 px-1">npm run dev:clean</code>.
        </p>
      </Alert>
    );
  }

  if (!data) {
    return (
      <LoadingState message="Loading outlet data… (large JSON, may take a few seconds)" />
    );
  }

  return (
    <div>
      <OptimizationBanner />

      <FilterBar
        provinces={provinces}
        distributors={distributors}
        province={province}
        distributor={distributor}
        westernOnly={westernOnly}
        search={search}
        filteredCount={filtered.length}
        totalCount={data.count}
        onProvinceChange={(v) => {
          setProvince(v);
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

      <OutletMap outlets={filtered} provinceFilter={province} />

      <OutletsTable rows={pageRows} />

      <div className="mt-4">
        <Pagination
          page={page}
          totalPages={totalPages}
          onPrevious={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      </div>
    </div>
  );
}
