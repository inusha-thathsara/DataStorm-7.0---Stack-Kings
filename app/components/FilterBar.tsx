import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, PanelHeader, PanelHeaderTitle } from "@/components/ui/Card";
import { Checkbox, FieldLabel } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type Props = {
  provinces: string[];
  distributors: string[];
  province: string;
  distributor: string;
  westernOnly: boolean;
  search: string;
  filteredCount: number;
  totalCount: number;
  hideWesternScope?: boolean;
  lockProvinceFilter?: boolean;
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
  hideWesternScope = false,
  lockProvinceFilter = false,
}: Props) {
  const hasActiveFilters = Boolean(province || distributor || westernOnly || search);

  function clearFilters() {
    onProvinceChange("");
    onDistributorChange("");
    onWesternOnlyChange(false);
    onSearchChange("");
  }

  return (
    <Card className="overflow-hidden p-0 shadow-card">
      <PanelHeader className="flex flex-wrap items-center justify-between gap-2">
        <PanelHeaderTitle>Filters & search</PanelHeaderTitle>
        <span className="text-xs tabular-nums text-text-muted">
          <span className="font-semibold text-text-primary">{filteredCount.toLocaleString()}</span>
          {" / "}
          {totalCount.toLocaleString()} outlets
        </span>
      </PanelHeader>

      <div className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <div>
            <FieldLabel htmlFor="filter-province">Province</FieldLabel>
            {lockProvinceFilter ? (
              <div
                id="filter-province"
                className="flex h-9 w-full items-center rounded-md border border-border bg-surface-muted px-3 text-sm text-text-secondary"
              >
                Western
              </div>
            ) : (
              <Select
                id="filter-province"
                value={province}
                onChange={(e) => onProvinceChange(e.target.value)}
                aria-label="Filter by province"
                className="w-full min-w-0"
              >
                <option value="">All provinces</option>
                {provinces.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div>
            <FieldLabel htmlFor="filter-distributor">Distributor</FieldLabel>
            <Select
              id="filter-distributor"
              value={distributor}
              onChange={(e) => onDistributorChange(e.target.value)}
              aria-label="Filter by distributor"
              className="w-full min-w-0"
            >
              <option value="">All distributors</option>
              {distributors.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </div>

          {!hideWesternScope && (
            <div className="flex items-end">
              <label className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-border bg-surface-card px-3 py-2 text-sm text-text-secondary transition-colors hover:border-emerald-300 hover:bg-semantic-success-bg/50">
                <Checkbox
                  id="filter-western"
                  checked={westernOnly}
                  onChange={(e) => onWesternOnlyChange(e.target.checked)}
                />
                <span>Western budget scope</span>
              </label>
            </div>
          )}

          <div className={hideWesternScope ? "sm:col-span-2" : ""}>
            <FieldLabel htmlFor="filter-search">Outlet ID</FieldLabel>
            <Input
              id="filter-search"
              placeholder="Search OUT_00001…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search outlet ID"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-muted pt-3">
            <span className="text-xs text-text-muted">Active:</span>
            {province && <Badge tone="info">{province}</Badge>}
            {distributor && <Badge tone="default">{distributor}</Badge>}
            {westernOnly && <Badge tone="success">Western budget</Badge>}
            {search && <Badge tone="muted">"{search}"</Badge>}
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear all
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
