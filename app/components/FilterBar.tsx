import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";

type Props = {
  provinces: string[];
  distributors: string[];
  province: string;
  distributor: string;
  westernOnly: boolean;
  search: string;
  filteredCount: number;
  totalCount: number;
  onProvinceChange: (value: string) => void;
  onDistributorChange: (value: string) => void;
  onWesternOnlyChange: (checked: boolean) => void;
  onSearchChange: (value: string) => void;
};

export function FilterBar({
  provinces,
  distributors,
  province,
  distributor,
  westernOnly,
  search,
  filteredCount,
  totalCount,
  onProvinceChange,
  onDistributorChange,
  onWesternOnlyChange,
  onSearchChange,
}: Props) {
  return (
    <Card className="mb-4 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        <Select
          value={province}
          onChange={(e) => onProvinceChange(e.target.value)}
          aria-label="Filter by province"
        >
          <option value="">All provinces</option>
          {provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>

        <Select
          value={distributor}
          onChange={(e) => onDistributorChange(e.target.value)}
          aria-label="Filter by distributor"
        >
          <option value="">All distributors</option>
          {distributors.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={westernOnly}
            onChange={(e) => onWesternOnlyChange(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Western budget scope only
        </label>

        <Input
          placeholder="Search Outlet_ID…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="md:min-w-[200px] md:flex-1"
          aria-label="Search outlet ID"
        />

        <span className="text-sm text-slate-500 md:ml-auto">
          {filteredCount.toLocaleString()} / {totalCount.toLocaleString()} outlets
        </span>
      </div>
    </Card>
  );
}
