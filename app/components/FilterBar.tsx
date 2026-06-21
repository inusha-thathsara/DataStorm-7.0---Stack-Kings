"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, PanelHeader, PanelHeaderTitle } from "@/components/ui/Card";
import { Checkbox, FieldLabel } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  createPreset,
  loadFilterPresets,
  saveFilterPresets,
  type FilterPreset,
  type OutletSortBy,
  type SortDir,
} from "@/lib/filterPresets";

type Props = {
  provinces: string[];
  distributors: string[];
  province: string;
  distributor: string;
  westernOnly: boolean;
  search: string;
  sortBy: OutletSortBy;
  sortDir: SortDir;
  highSaturationOnly: boolean;
  hasTradeSpendOnly: boolean;
  filteredCount: number;
  totalCount: number;
  hideWesternScope?: boolean;
  lockProvinceFilter?: boolean;
  onProvinceChange: (value: string) => void;
  onDistributorChange: (value: string) => void;
  onWesternOnlyChange: (checked: boolean) => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: OutletSortBy) => void;
  onSortDirChange: (value: SortDir) => void;
  onHighSaturationOnlyChange: (checked: boolean) => void;
  onHasTradeSpendOnlyChange: (checked: boolean) => void;
  onApplyPreset: (preset: FilterPreset) => void;
};

export function FilterBar({
  provinces,
  distributors,
  province,
  distributor,
  westernOnly,
  search,
  sortBy,
  sortDir,
  highSaturationOnly,
  hasTradeSpendOnly,
  filteredCount,
  totalCount,
  onProvinceChange,
  onDistributorChange,
  onWesternOnlyChange,
  onSearchChange,
  onSortByChange,
  onSortDirChange,
  onHighSaturationOnlyChange,
  onHasTradeSpendOnlyChange,
  onApplyPreset,
  hideWesternScope = false,
  lockProvinceFilter = false,
}: Props) {
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [presetName, setPresetName] = useState("");

  useEffect(() => {
    setPresets(loadFilterPresets());
  }, []);

  const hasActiveFilters = Boolean(
    province || distributor || westernOnly || search || highSaturationOnly || hasTradeSpendOnly
  );

  function clearFilters() {
    onProvinceChange("");
    onDistributorChange("");
    onWesternOnlyChange(false);
    onSearchChange("");
    onHighSaturationOnlyChange(false);
    onHasTradeSpendOnlyChange(false);
  }

  function saveCurrentPreset() {
    const name = presetName.trim() || `Preset ${presets.length + 1}`;
    const preset = createPreset(name, {
      province,
      distributor,
      westernOnly,
      search,
      sortBy,
      sortDir,
      highSaturationOnly,
      hasTradeSpendOnly,
    });
    const next = [...presets, preset];
    saveFilterPresets(next);
    setPresets(next);
    setPresetName("");
  }

  function deletePreset(id: string) {
    const next = presets.filter((p) => p.id !== id);
    saveFilterPresets(next);
    setPresets(next);
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

          <div>
            <FieldLabel htmlFor="filter-sort">Sort by</FieldLabel>
            <div className="flex gap-2">
              <Select
                id="filter-sort"
                value={sortBy}
                onChange={(e) => onSortByChange(e.target.value as OutletSortBy)}
                aria-label="Sort outlets by"
                className="min-w-0 flex-1"
              >
                <option value="id">Outlet ID</option>
                <option value="gapLiters">Gap (L)</option>
                <option value="predictedLiters">Predicted (L)</option>
                <option value="tradeSpendLkr">Trade spend</option>
              </Select>
              <Select
                id="filter-sort-dir"
                value={sortDir}
                onChange={(e) => onSortDirChange(e.target.value as SortDir)}
                aria-label="Sort direction"
                className="w-24"
              >
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </Select>
            </div>
          </div>

          <div>
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

        <div className="mt-3 flex flex-wrap gap-3">
          {!hideWesternScope && (
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface-card px-3 py-2 text-sm text-text-secondary">
              <Checkbox
                id="filter-western"
                checked={westernOnly}
                onChange={(e) => onWesternOnlyChange(e.target.checked)}
              />
              <span>Western budget scope</span>
            </label>
          )}
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface-card px-3 py-2 text-sm text-text-secondary">
            <Checkbox
              id="filter-high-sat"
              checked={highSaturationOnly}
              onChange={(e) => onHighSaturationOnlyChange(e.target.checked)}
            />
            <span>High saturation only</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface-card px-3 py-2 text-sm text-text-secondary">
            <Checkbox
              id="filter-has-spend"
              checked={hasTradeSpendOnly}
              onChange={(e) => onHasTradeSpendOnlyChange(e.target.checked)}
            />
            <span>Has trade spend</span>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border-muted pt-3">
          <div className="min-w-[140px] flex-1">
            <FieldLabel htmlFor="filter-preset">Saved presets</FieldLabel>
            <Select
              id="filter-preset"
              defaultValue=""
              onChange={(e) => {
                const preset = presets.find((p) => p.id === e.target.value);
                if (preset) onApplyPreset(preset);
                e.target.value = "";
              }}
              aria-label="Load saved filter preset"
            >
              <option value="">Load preset…</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <Input
            placeholder="Preset name"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            aria-label="Preset name"
            className="max-w-[160px]"
          />
          <Button type="button" variant="outline" size="sm" onClick={saveCurrentPreset}>
            Save preset
          </Button>
          {presets.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => deletePreset(presets[presets.length - 1].id)}
            >
              Delete last
            </Button>
          )}
        </div>

        {hasActiveFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-muted pt-3">
            <span className="text-xs text-text-muted">Active:</span>
            {province && <Badge tone="info">{province}</Badge>}
            {distributor && <Badge tone="default">{distributor}</Badge>}
            {westernOnly && <Badge tone="success">Western budget</Badge>}
            {highSaturationOnly && <Badge tone="warning">High saturation</Badge>}
            {hasTradeSpendOnly && <Badge tone="success">Has spend</Badge>}
            {search && <Badge tone="muted">&quot;{search}&quot;</Badge>}
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear all
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export function CompareBar({
  selectedIds,
  onClear,
}: {
  selectedIds: string[];
  onClear: () => void;
}) {
  if (!selectedIds.length) return null;
  const canCompare = selectedIds.length === 2;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 border-emerald-200 bg-semantic-success-bg/40 p-3 shadow-card">
      <p className="text-sm text-text-secondary">
        Compare selected: <strong>{selectedIds.join(" · ")}</strong> ({selectedIds.length}/2)
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
        {canCompare ? (
          <Link href={`/compare?a=${encodeURIComponent(selectedIds[0])}&b=${encodeURIComponent(selectedIds[1])}`}>
            <Button variant="primary" size="sm">
              Compare outlets
            </Button>
          </Link>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Select 2 outlets
          </Button>
        )}
      </div>
    </Card>
  );
}
