const STORAGE_KEY = "stackkings:compareIds";
const MAX = 2;

export function loadCompareIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function saveCompareIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX)));
}

export function toggleCompareId(id: string): string[] {
  const current = loadCompareIds();
  if (current.includes(id)) {
    const next = current.filter((x) => x !== id);
    saveCompareIds(next);
    return next;
  }
  if (current.length >= MAX) {
    const next = [current[1], id];
    saveCompareIds(next);
    return next;
  }
  const next = [...current, id];
  saveCompareIds(next);
  return next;
}

export function compareUrl(a: string, b: string): string {
  return `/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
}

/** Replace one compare slot; if the new id matches the other slot, swap them. */
export function replaceCompareSlot(
  currentA: string,
  currentB: string,
  slot: "a" | "b",
  newId: string
): { a: string; b: string } {
  const id = newId.trim();
  if (slot === "a") {
    if (id === currentB) return { a: currentB, b: currentA };
    return { a: id, b: currentB };
  }
  if (id === currentA) return { a: currentB, b: currentA };
  return { a: currentA, b: id };
}

/** Resolve slot A/B from URL params and/or sessionStorage (max 2). */
export function resolveComparePair(
  urlA: string,
  urlB: string,
  storedIds: string[] = []
): { a: string; b: string } | null {
  const a = urlA.trim();
  const b = urlB.trim();
  if (a && b) return { a, b };

  const stored = storedIds;
  if (a && stored.length >= 1) {
    const other = stored.find((id) => id !== a);
    if (other) return { a, b: other };
  }
  if (!a && stored.length === 2) return { a: stored[0], b: stored[1] };
  return null;
}

/**
 * Start compare from an outlet detail page.
 * If another outlet is already selected, go straight to compare; otherwise pick second on browse.
 */
export function startCompareWith(outletId: string): string {
  const id = outletId.trim();
  const stored = loadCompareIds().filter((x) => x !== id);
  if (stored.length >= 1) {
    const pair = [id, stored[0]];
    saveCompareIds(pair);
    return compareUrl(pair[0], pair[1]);
  }
  saveCompareIds([id]);
  return `/?compare=${encodeURIComponent(id)}`;
}
