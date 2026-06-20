import type { OutletListParams } from "@/lib/db/queries";

export function parseOutletQuery(
  searchParams: URLSearchParams
): OutletListParams {
  const page = Number(searchParams.get("page") ?? "0");
  const pageSize = Number(searchParams.get("pageSize") ?? "50");

  return {
    province: searchParams.get("province") ?? undefined,
    distributorId: searchParams.get("distributor") ?? undefined,
    westernOnly: searchParams.get("westernOnly") === "true",
    search: searchParams.get("search") ?? undefined,
    page: Number.isFinite(page) ? page : 0,
    pageSize: Number.isFinite(pageSize) ? pageSize : 50,
  };
}

export function filterQueryString(params: OutletListParams): string {
  const q = new URLSearchParams();
  if (params.province) q.set("province", params.province);
  if (params.distributorId) q.set("distributor", params.distributorId);
  if (params.westernOnly) q.set("westernOnly", "true");
  if (params.search) q.set("search", params.search);
  return q.toString();
}
