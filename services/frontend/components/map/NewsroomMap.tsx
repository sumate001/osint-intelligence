"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { useT } from "@/lib/hooks/useT";
import type { MapPoint } from "@/lib/types/map";

/**
 * Where the reporting says things are happening.
 *
 * OpenStreetMap tiles rather than a commercial basemap: this is a self-hosted
 * newsroom tool, and asking a tile provider for the map of an investigation
 * tells them what the newsroom is looking at. OSM asks for attribution and
 * nothing else.
 *
 * A marker is a *place*, not an event. The same district appears in a dozen
 * signals over a week, and a dozen pins on one dot reads as noise where one pin
 * saying twelve reads as a pattern.
 */

/** Leaflet's default marker images resolve relative to its CSS, which Next's
 * bundler rewrites. Drawing the pin instead needs no images at all and carries
 * the count, which is the number worth seeing before clicking anything. */
function pin(count: number) {
  const size = count > 9 ? 34 : count > 3 ? 30 : 26;
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      background:rgba(192,57,43,.85);color:#fff;
      font:600 ${count > 9 ? 12 : 11}px/1 ui-monospace,monospace;
      border:2px solid rgba(255,255,255,.55);
      box-shadow:0 1px 6px rgba(0,0,0,.5);
    ">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Keeps the viewport on the data. Without it the map opens on the same fixed
 * centre whatever the beat is, and for a southern-border story that puts the
 * story off-screen. */
function FitToPoints({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 9);
      return;
    }
    map.fitBounds(
      L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number])),
      { padding: [40, 40], maxZoom: 11 },
    );
  }, [map, points]);
  return null;
}

export function NewsroomMap({ points }: { points: MapPoint[] }) {
  const t = useT();

  return (
    <MapContainer
      center={[13.7, 100.5]}
      zoom={6}
      scrollWheelZoom
      className="h-[520px] w-full rounded-xl"
      style={{ background: "var(--surface-2)" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToPoints points={points} />
      {points.map((point) => (
        <Marker
          key={point.qid ?? `${point.latitude},${point.longitude}`}
          position={[point.latitude, point.longitude]}
          icon={pin(point.count)}
        >
          <Popup>
            <div className="max-w-[280px] space-y-1">
              <p className="text-sm font-medium">{point.label || point.name}</p>
              {point.label && point.label !== point.name && (
                <p className="text-[11px] text-neutral-500">{point.name}</p>
              )}
              <p className="text-[11px] text-neutral-500">
                {t("map.events_here").replace("{n}", String(point.count))}
              </p>
              <ul className="space-y-1 pt-1">
                {point.events.slice(0, 5).map((event, i) => (
                  <li key={i} className="text-[12px] leading-snug">
                    {event.url ? (
                      <a href={event.url} target="_blank" rel="noreferrer" className="underline">
                        {event.summary}
                      </a>
                    ) : (
                      event.summary
                    )}
                    {event.source_name && (
                      <span className="text-neutral-500"> · {event.source_name}</span>
                    )}
                  </li>
                ))}
                {point.events.length > 5 && (
                  <li className="text-[11px] text-neutral-500">
                    {t("map.and_more").replace("{n}", String(point.events.length - 5))}
                  </li>
                )}
              </ul>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
