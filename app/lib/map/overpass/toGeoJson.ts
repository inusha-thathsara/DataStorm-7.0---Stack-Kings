import type { GeoJsonFeatureCollection } from "../types";

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

/** Convert Overpass `out center` JSON to a Point GeoJSON collection */
export function overpassToGeoJson(
  data: OverpassResponse,
  layer: string
): GeoJsonFeatureCollection {
  const features =
    data.elements?.map((el) => {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat == null || lon == null) return null;

      return {
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [lon, lat] as [number, number],
        },
        properties: {
          id: el.id,
          layer,
          name: el.tags?.name ?? el.tags?.amenity ?? el.tags?.shop ?? "",
        },
      };
    }).filter(Boolean) ?? [];

  return {
    type: "FeatureCollection",
    features: features as GeoJsonFeatureCollection["features"],
  };
}
