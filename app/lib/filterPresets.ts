export type OutletSortBy = "id" | "gapLiters" | "predictedLiters" | "tradeSpendLkr";
export type SortDir = "asc" | "desc";

export type FilterPreset = {
  id: string;
  name: string;
  province: string;
  distributor: string;
  westernOnly: boolean;
  search: string;
  sortBy: OutletSortBy;
  sortDir: SortDir;
  highSaturationOnly: boolean;
  hasTradeSpendOnly: boolean;
};

const STORAGE_KEY = "stackkings:filterPresets";

export function loadFilterPresets(): FilterPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FilterPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFilterPresets(presets: FilterPreset[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function createPreset(name: string, state: Omit<FilterPreset, "id" | "name">): FilterPreset {
  return {
    id: `preset-${Date.now()}`,
    name,
    ...state,
  };
}
