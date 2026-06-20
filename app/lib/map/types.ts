import type { Outlet } from "@/lib/types";

export type MapMarker = {
  outlet: Outlet;
  position: [number, number];
  color: string;
  highlighted: boolean;
};

/** Overpass overlay layers exposed to the map UI */
export type OverpassLayerId =
  | "transport"
  | "food"
  | "worship"
  | "education"
  | "health"
  | "market";

export type OverpassLayerMeta = {
  id: OverpassLayerId;
  label: string;
  color: string;
};

export const OVERPASS_LAYERS: OverpassLayerMeta[] = [
  { id: "transport", label: "Transport", color: "#0ea5e9" },
  { id: "food", label: "Food service", color: "#f97316" },
  { id: "worship", label: "Worship", color: "#a855f7" },
  { id: "education", label: "Education", color: "#eab308" },
  { id: "health", label: "Health", color: "#ef4444" },
  { id: "market", label: "Market", color: "#22c55e" },
];

export type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: Record<string, string | number | undefined>;
  }>;
};
