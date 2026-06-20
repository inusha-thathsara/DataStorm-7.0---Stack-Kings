import type { OverpassLayerId } from "../types";

/** Sri Lanka bbox for Overpass: (south, west, north, east) */
const BBOX = "5.90,79.60,9.90,81.90";

const LAYER_FILTERS: Record<OverpassLayerId, string> = {
  transport: `
    node["amenity"~"^(bus_station|bus_stop)$"](${BBOX});
    way["amenity"="bus_station"](${BBOX});
  `,
  food: `
    node["amenity"~"^(restaurant|fast_food|cafe|bar)$"](${BBOX});
  `,
  worship: `
    node["amenity"="place_of_worship"](${BBOX});
  `,
  education: `
    node["amenity"~"^(school|college|university|kindergarten)$"](${BBOX});
  `,
  health: `
    node["amenity"~"^(hospital|clinic|pharmacy|doctors)$"](${BBOX});
  `,
  market: `
    node["shop"~"^(supermarket|convenience|grocery)$"](${BBOX});
    node["amenity"="marketplace"](${BBOX});
  `,
};

export function buildOverpassQuery(layer: OverpassLayerId): string {
  const body = LAYER_FILTERS[layer].trim();
  return `[out:json][timeout:90];(${body});out center;`;
}

export const VALID_OVERPASS_LAYERS = Object.keys(LAYER_FILTERS) as OverpassLayerId[];

export function isValidOverpassLayer(value: string): value is OverpassLayerId {
  return (VALID_OVERPASS_LAYERS as string[]).includes(value);
}
