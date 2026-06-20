/** Sri Lanka bounding box for map fit and validation */
export const SL_BOUNDS = {
  latMin: 5.85,
  latMax: 9.95,
  lonMin: 79.65,
  lonMax: 81.95,
} as const;

/** Default map center (approx. center of Sri Lanka) */
export const SL_CENTER: [number, number] = [7.8731, 80.7718];

export const DEFAULT_ZOOM = Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_ZOOM) || 8;

export function isValidOutletCoord(lat: number, lon: number): boolean {
  if (lat < 1 || lon < 1) return false;
  const { latMin, latMax, lonMin, lonMax } = SL_BOUNDS;
  return lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax;
}

/** Leaflet bounds: [[south, west], [north, east]] */
export const SL_LEAFLET_BOUNDS: [[number, number], [number, number]] = [
  [SL_BOUNDS.latMin, SL_BOUNDS.lonMin],
  [SL_BOUNDS.latMax, SL_BOUNDS.lonMax],
];
