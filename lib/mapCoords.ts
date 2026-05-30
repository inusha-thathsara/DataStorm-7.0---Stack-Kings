/** Sri Lanka bounding box for outlet scatter map */
export const SL_BOUNDS = {
  latMin: 5.85,
  latMax: 9.95,
  lonMin: 79.65,
  lonMax: 81.95,
};

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
