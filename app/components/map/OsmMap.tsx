"use client";

import { MapContainer, TileLayer } from "react-leaflet";
import { SL_CENTER, SL_LEAFLET_BOUNDS, DEFAULT_ZOOM } from "@/lib/map/bounds";
import type { MapMarker, OverpassLayerId } from "@/lib/map/types";
import { isValidOverpassLayer } from "@/lib/map/overpass/queries";
import { OutletMarkers } from "./OutletMarkers";
import { PoiOverlay } from "./PoiOverlay";
import "leaflet/dist/leaflet.css";
import "./leaflet.css";

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

type Props = {
  markers: MapMarker[];
  showDetailLinks?: boolean;
  className?: string;
};

function resolvePoiLayer(): OverpassLayerId | null {
  const raw = process.env.NEXT_PUBLIC_MAP_POI_OVERLAY ?? "off";
  if (raw === "off" || !raw) return null;
  return isValidOverpassLayer(raw) ? raw : null;
}

export function OsmMap({ markers, showDetailLinks = true, className }: Props) {
  const poiLayer = resolvePoiLayer();

  return (
    <div className={className}>
      <MapContainer
        center={SL_CENTER}
        zoom={DEFAULT_ZOOM}
        maxBounds={SL_LEAFLET_BOUNDS}
        maxBoundsViscosity={0.85}
        scrollWheelZoom
        className="osm-map-container"
      >
        <TileLayer
          attribution={OSM_ATTRIBUTION}
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {poiLayer && <PoiOverlay layerId={poiLayer} />}
        <OutletMarkers markers={markers} showDetailLinks={showDetailLinks} />
      </MapContainer>
    </div>
  );
}
