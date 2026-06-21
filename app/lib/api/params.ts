import type { OutletListParams, OutletSortBy, SortDir } from "@/lib/db/queries";

export function parseOutletQuery(searchParams: URLSearchParams): OutletListParams {
  const page = Number(searchParams.get("page") ?? "0");
  const pageSize = Number(searchParams.get("pageSize") ?? "50");
  const sortBy = (searchParams.get("sortBy") as OutletSortBy | null) ?? undefined;
  const sortDir = (searchParams.get("sortDir") as SortDir | null) ?? undefined;

  return {
    province: searchParams.get("province") ?? undefined,
    distributorId: searchParams.get("distributor") ?? undefined,
    westernOnly: searchParams.get("westernOnly") === "true",
    search: searchParams.get("search") ?? undefined,
    page: Number.isFinite(page) ? page : 0,
    pageSize: Number.isFinite(pageSize) ? pageSize : 50,
    sortBy: sortBy && ["id", "gapLiters", "predictedLiters", "tradeSpendLkr"].includes(sortBy) ? sortBy : undefined,
    sortDir: sortDir === "asc" || sortDir === "desc" ? sortDir : undefined,
    highSaturationOnly: searchParams.get("highSaturationOnly") === "true",
    hasTradeSpendOnly: searchParams.get("hasTradeSpendOnly") === "true",
  };
}

export function filterQueryString(params: OutletListParams): string {
  const q = new URLSearchParams();
  if (params.province) q.set("province", params.province);
  if (params.distributorId) q.set("distributor", params.distributorId);
  if (params.westernOnly) q.set("westernOnly", "true");
  if (params.search) q.set("search", params.search);
  if (params.sortBy) q.set("sortBy", params.sortBy);
  if (params.sortDir) q.set("sortDir", params.sortDir);
  if (params.highSaturationOnly) q.set("highSaturationOnly", "true");
  if (params.hasTradeSpendOnly) q.set("hasTradeSpendOnly", "true");
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  return q.toString();
}
