# OpenStreetMap + Overpass Map Integration

This guide replaces the custom SVG scatter plot with a **real OpenStreetMap basemap** (Leaflet) and optional **Overpass API** overlays for contextual POI layers.

## Important distinction

| Layer | Source | Purpose |
|-------|--------|---------|
| **Basemap** | OSM raster tiles (`tile.openstreetmap.org`) | Roads, cities, geography |
| **Outlet pins** | `public/data/outlets.json` (lat/lon) | Your 20k outlets — **not** from Overpass |
| **POI overlay** (optional) | Overpass API via `/api/map/overpass` | Schools, transport, etc. for context |

The batch pipeline already uses Overpass in `src/phase3_poi_acquire.py` at build time. The web app uses Overpass only for **optional live overlays** (or you can bake GeoJSON offline — recommended for production).

---

## File structure

```
app/
├── app/
│   └── api/
│       └── map/
│           └── overpass/
│               └── route.ts          # Server proxy → Overpass API
├── components/
│   └── map/
│       ├── OutletMap.tsx             # Card shell + legend (public API)
│       ├── OsmMap.tsx                # Leaflet map (client-only)
│       ├── OutletMarkers.tsx         # Outlet circle markers
│       ├── MapLegend.tsx             # Province / spend legend
│       ├── PoiOverlay.tsx            # Optional Overpass GeoJSON layer
│       └── leaflet.css               # Leaflet base styles
├── lib/
│   └── map/
│       ├── bounds.ts                 # Sri Lanka bounds + default view
│       ├── pins.ts                   # Pin colors (province / spend)
│       ├── sample.ts                 # Map pin sampling (performance)
│       ├── types.ts                  # MapMarker, OverpassLayer types
│       └── overpass/
│           ├── queries.ts            # Overpass QL per layer
│           └── toGeoJson.ts          # Overpass JSON → GeoJSON
└── public/
    └── data/
        └── map/                      # Optional: pre-baked GeoJSON (you create)
            └── poi-transport.geojson
```

Legacy files kept for reference until you delete them:

- `app/lib/mapCoords.ts` → superseded by `app/lib/map/bounds.ts`
- `app/lib/mapSample.ts` → superseded by `app/lib/map/sample.ts` + `pins.ts`

---

## Manual steps (required)

### 1. Install dependencies

From the `app/` folder:

```bash
npm install leaflet react-leaflet@4
npm install -D @types/leaflet
```

Use **react-leaflet v4** (this app is on React 18; v5 requires React 19).

### 2. Environment variables

Add to `app/.env.local` (and `app/.env.example` for the team):

```env
# Overpass endpoint (default: public instance)
OVERPASS_API_URL=https://overpass-api.de/api/interpreter

# Optional: disable live Overpass calls in production (use static GeoJSON instead)
NEXT_PUBLIC_MAP_POI_OVERLAY=off
# Values: off | transport | food | worship | education

# Map defaults
NEXT_PUBLIC_MAP_DEFAULT_ZOOM=8
```

Restart the dev server after changing env vars.

### 3. OSM tile usage

The app uses the standard OSM tile server. You **must** keep the attribution line visible (handled in `OsmMap.tsx`). For high-traffic production, consider:

- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- A commercial tile provider (MapTiler, Stadia, etc.) — change `tileUrl` in `OsmMap.tsx`

### 4. Overpass rate limits

Public Overpass instances are shared. **Do not** query on every page load for all users.

**Recommended for production:**

1. Run the pipeline POI step with internet access:
   ```bash
   python src/phase3_poi_acquire.py
   ```
2. Export a lightweight GeoJSON for the app (manual script — see step 5).
3. Set `NEXT_PUBLIC_MAP_POI_OVERLAY=off` and serve static files from `public/data/map/`.

**For development / demos:** set `NEXT_PUBLIC_MAP_POI_OVERLAY=transport` to fetch one layer via the API proxy (cached 24h server-side).

### 5. (Optional) Bake POI GeoJSON offline

Create `public/data/map/poi-transport.geojson` from pipeline output:

```bash
# Example: convert gold/features/poi_raw/transport.json → GeoJSON
# (Write a small script or use QGIS / ogr2ogr — not included in repo yet)
```

Then enable static overlay in `PoiOverlay.tsx` by pointing at `/data/map/poi-transport.geojson`.

### 6. Verify locally

```bash
cd app
npm run dev
```

Open http://localhost:3000 — you should see OSM tiles with outlet markers. Zoom/pan should work. Toggle POI overlay only if env is set.

### 7. Deploy (Vercel)

- No extra env vars required for basemap + outlets only.
- If using live Overpass proxy: set `OVERPASS_API_URL` in Vercel project settings.
- Expect cold-start + Overpass latency on first POI request; prefer static GeoJSON for demos/judging.

---

## Switching from SVG to Leaflet

`app/components/OutletMap.tsx` re-exports the new map component. Pages already use:

```tsx
dynamic(() => import("@/components/OutletMap").then((m) => m.OutletMap), { ssr: false })
```

No page changes needed after install + restart.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `window is not defined` | Ensure map is loaded with `dynamic(..., { ssr: false })` |
| Blank map, grey tiles | Check network; OSM tiles blocked by firewall |
| Overpass 429 / 504 | Reduce layers; use static GeoJSON; increase cache TTL in `route.ts` |
| Markers slow with 12k pins | Sampling is on by default (`lib/map/sample.ts`); lower `MAX_MAP_POINTS_MULTI` if needed |
| MarkerCluster | Optional: `npm install react-leaflet-cluster` — not included by default |

---

## What we did NOT change

- Outlet coordinates still come from `outlets.json` (pipeline export).
- Filter, pagination, and table behavior unchanged.
- Batch POI features in the model still come from `phase3_poi_acquire.py` / synthetic fallback.
