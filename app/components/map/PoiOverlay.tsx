"use client";

import { useEffect, useState } from "react";
import L from "leaflet";
import { GeoJSON } from "react-leaflet";
import type { GeoJsonFeatureCollection, OverpassLayerId } from "@/lib/map/types";
import { OVERPASS_LAYERS } from "@/lib/map/types";

type Props = {
  layerId: OverpassLayerId;
};

export function PoiOverlay({ layerId }: Props) {
  const [data, setData] = useState<GeoJsonFeatureCollection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meta = OVERPASS_LAYERS.find((l) => l.id === layerId);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);

    fetch(`/api/map/overpass?layer=${layerId}`)
      .then((r) => {
        if (!r.ok) return r.json().then((j) => Promise.reject(new Error(j.error ?? r.statusText)));
        return r.json();
      })
      .then((json: GeoJsonFeatureCollection) => {
        if (!cancelled) setData(json);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [layerId]);

  if (error) {
    console.warn(`POI overlay (${layerId}):`, error);
    return null;
  }

  if (!data?.features?.length) return null;

  return (
    <GeoJSON
      key={layerId}
      data={data}
      pointToLayer={(_feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 3,
          color: meta?.color ?? "#64748b",
          fillColor: meta?.color ?? "#64748b",
          fillOpacity: 0.5,
          weight: 1,
        })
      }
    />
  );
}
