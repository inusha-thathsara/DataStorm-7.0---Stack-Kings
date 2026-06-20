import { NextRequest, NextResponse } from "next/server";
import { buildOverpassQuery, isValidOverpassLayer } from "@/lib/map/overpass/queries";
import { overpassToGeoJson } from "@/lib/map/overpass/toGeoJson";

const OVERPASS_URL =
  process.env.OVERPASS_API_URL ?? "https://overpass-api.de/api/interpreter";

/** In-memory cache (per server instance). Use static GeoJSON in production. */
const cache = new Map<string, { expires: number; body: unknown }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const layer = request.nextUrl.searchParams.get("layer") ?? "";

  if (!isValidOverpassLayer(layer)) {
    return NextResponse.json(
      { error: "Invalid layer. Use: transport, food, worship, education, health, market" },
      { status: 400 }
    );
  }

  const cached = cache.get(layer);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.body, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  }

  const query = buildOverpassQuery(layer);

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Overpass API returned ${res.status}` },
        { status: 502 }
      );
    }

    const json = await res.json();
    const geojson = overpassToGeoJson(json, layer);

    cache.set(layer, { expires: Date.now() + CACHE_TTL_MS, body: geojson });

    return NextResponse.json(geojson, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Overpass request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
