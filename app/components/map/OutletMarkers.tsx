"use client";

import Link from "next/link";
import { CircleMarker, Popup } from "react-leaflet";
import type { MapMarker } from "@/lib/map/types";

type Props = {
  markers: MapMarker[];
  showDetailLinks?: boolean;
};

export function OutletMarkers({ markers, showDetailLinks = true }: Props) {
  return (
    <>
      {markers.map(({ outlet, position, color, highlighted }) => (
        <CircleMarker
          key={outlet.id}
          center={position}
          radius={highlighted ? 10 : 5}
          pathOptions={{
            color: highlighted ? "#ffffff" : color,
            fillColor: highlighted ? "#dc2626" : color,
            fillOpacity: highlighted ? 1 : 0.75,
            weight: highlighted ? 2.5 : 1,
          }}
        >
          <Popup>
            <div className="min-w-[140px] text-sm">
              <p className="font-semibold text-slate-900">{outlet.id}</p>
              <p className="text-xs text-slate-600">{outlet.province}</p>
              <p className="mt-1 tabular-nums text-slate-800">
                {outlet.predictedLiters.toFixed(1)} L predicted
              </p>
              {outlet.tradeSpendLkr > 0 && (
                <p className="text-xs font-medium text-emerald-700">
                  LKR {outlet.tradeSpendLkr.toLocaleString()} spend
                </p>
              )}
              {showDetailLinks && (
                <Link
                  href={`/outlet/${outlet.id}`}
                  className="mt-2 inline-block text-xs font-medium text-emerald-700 hover:underline"
                >
                  View outlet →
                </Link>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}
