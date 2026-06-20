import { SL_BOUNDS } from "./map/bounds";

/** @deprecated Use `@/lib/map/bounds` — SVG projection helper only */
export { SL_BOUNDS };

export function projectLatLon(
  lat: number,
  lon: number,
  width: number,
  height: number
): { x: number; y: number } | null {
  if (lat < 1 || lon < 1) return null;
  const { latMin, latMax, lonMin, lonMax } = SL_BOUNDS;
  if (lat < latMin || lat > latMax || lon < lonMin || lon > lonMax) return null;
  const x = ((lon - lonMin) / (lonMax - lonMin)) * width;
  const y = ((latMax - lat) / (latMax - latMin)) * height;
  return { x, y };
}
