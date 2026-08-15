"use client";

import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import { CATEGORY_COLORS, CATEGORY_LABELS, type BookmarkView, type Coords } from "@/lib/neighborhood";

import "maplibre-gl/dist/maplibre-gl.css";

/**
 * The map canvas for M2.4.
 *
 * MapLibre GL JS needs no key of its own, but the tiles do — so the style URL
 * points at our own proxy route, which fetches the real style server-side and
 * rewrites every URL inside it to come back through the same proxy. Nothing
 * here has, or can obtain, a provider credential.
 *
 * When no tile key is configured the map still works: pins, popups and the
 * long-press handler all function over a plain background, with a banner
 * saying why there is no basemap. A neighbourhood map that refuses to render
 * at all because a key is missing would take the house's notes down with it.
 */

const STYLE_URL = "/api/neighborhood/tiles/styles/osm-liberty/style.json";

/** Used when no tile provider is configured — an empty but valid style. */
const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#e8ede9" },
    },
  ],
  glyphs: undefined,
};

/** Dhaka, for a house that has not placed its pin yet. */
const FALLBACK_CENTER: Coords = { lat: 23.8103, lng: 90.4125 };

export type MapMarker = Pick<BookmarkView, "id" | "name" | "category" | "lat" | "lng"> & {
  activeDealCount?: number;
  href?: string;
};

export function HouseMap({
  pin,
  markers,
  tilesEnabled,
  onLongPress,
  draftPin,
  routeGeometry,
  className = "h-[28rem]",
}: {
  pin: Coords | null;
  markers: MapMarker[];
  tilesEnabled: boolean;
  /** Enables drop-a-pin, used by house setup and by adding a place by hand. */
  onLongPress?: (coords: Coords) => void;
  draftPin?: Coords | null;
  /** [lng, lat] pairs from a directions call. */
  routeGeometry?: [number, number][] | null;
  className?: string;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const drawn = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);

  // Long-press needs the latest callback without tearing the map down and
  // rebuilding it every time the parent re-renders.
  const longPress = useRef(onLongPress);
  longPress.current = onLongPress;

  useEffect(() => {
    if (!container.current || map.current) return;

    const center = pin ?? FALLBACK_CENTER;
    const instance = new maplibregl.Map({
      container: container.current,
      style: tilesEnabled ? STYLE_URL : BLANK_STYLE,
      center: [center.lng, center.lat],
      zoom: pin ? 14 : 11,
      attributionControl: { compact: true },
    });

    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    // Long-press to drop a pin, on both pointer types. `contextmenu` covers the
    // desktop right-click and, on most mobile browsers, the touch-and-hold.
    instance.on("contextmenu", (event) => {
      longPress.current?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });

    let touchTimer: ReturnType<typeof setTimeout> | null = null;
    instance.on("touchstart", (event) => {
      if (event.points.length !== 1) return;
      touchTimer = setTimeout(() => {
        longPress.current?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
      }, 600);
    });
    const cancelTouch = () => {
      if (touchTimer) clearTimeout(touchTimer);
      touchTimer = null;
    };
    instance.on("touchend", cancelTouch);
    instance.on("touchmove", cancelTouch);
    instance.on("touchcancel", cancelTouch);

    instance.on("load", () => setReady(true));
    // A style that fails to load (proxy down, key revoked) must not take the
    // whole page with it — the pins are drawn on top and still render.
    instance.on("error", (event) => console.warn("[m2.4 map]", event.error?.message ?? event));

    map.current = instance;

    return () => {
      cancelTouch();
      instance.remove();
      map.current = null;
    };
    // Built once. Marker and route updates are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Pins ─────────────────────────────────────────────────────────────── */

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    for (const marker of drawn.current) marker.remove();
    drawn.current = [];

    if (pin) {
      const element = document.createElement("div");
      element.className =
        "flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-[10px] font-bold text-white shadow";
      element.textContent = "H";
      element.title = "Your house";
      drawn.current.push(
        new maplibregl.Marker({ element }).setLngLat([pin.lng, pin.lat]).addTo(instance)
      );
    }

    for (const marker of markers) {
      if (marker.lat === null || marker.lng === null) continue;

      const element = document.createElement("div");
      element.className =
        "h-4 w-4 cursor-pointer rounded-full border-2 border-white shadow ring-1 ring-black/10";
      element.style.backgroundColor = CATEGORY_COLORS[marker.category];
      element.title = `${marker.name} — ${CATEGORY_LABELS[marker.category]}`;

      // A badge on pins carrying live deals, so the offers layer is visible
      // without turning the map into a wall of labels.
      if (marker.activeDealCount && marker.activeDealCount > 0) {
        const badge = document.createElement("span");
        badge.className =
          "absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white";
        badge.textContent = String(marker.activeDealCount);
        element.style.position = "relative";
        element.appendChild(badge);
      }

      const popup = new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(
        `<div style="font-size:12px;line-height:1.4">
           <strong>${escapeHtml(marker.name)}</strong><br />
           <span style="color:#64748b">${escapeHtml(CATEGORY_LABELS[marker.category])}</span>
           ${
             marker.href
               ? `<br /><a href="${escapeHtml(marker.href)}" style="color:#047857">Open</a>`
               : ""
           }
         </div>`
      );

      drawn.current.push(
        new maplibregl.Marker({ element })
          .setLngLat([marker.lng, marker.lat])
          .setPopup(popup)
          .addTo(instance)
      );
    }

    if (draftPin) {
      const element = document.createElement("div");
      element.className =
        "h-5 w-5 animate-pulse rounded-full border-2 border-white bg-brand-600 shadow";
      element.title = "New pin";
      drawn.current.push(
        new maplibregl.Marker({ element }).setLngLat([draftPin.lng, draftPin.lat]).addTo(instance)
      );
    }
  }, [pin, markers, draftPin]);

  /* ── Route line ───────────────────────────────────────────────────────── */

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;

    const existing = instance.getSource("m24-route");
    if (!routeGeometry) {
      if (existing) {
        if (instance.getLayer("m24-route-line")) instance.removeLayer("m24-route-line");
        instance.removeSource("m24-route");
      }
      return;
    }

    const data = {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: routeGeometry },
    };

    if (existing) {
      (existing as maplibregl.GeoJSONSource).setData(data);
    } else {
      instance.addSource("m24-route", { type: "geojson", data });
      instance.addLayer({
        id: "m24-route-line",
        type: "line",
        source: "m24-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#047857", "line-width": 4, "line-opacity": 0.85 },
      });
    }

    const bounds = routeGeometry.reduce(
      (acc, coord) => acc.extend(coord),
      new maplibregl.LngLatBounds(routeGeometry[0], routeGeometry[0])
    );
    instance.fitBounds(bounds, { padding: 60, maxZoom: 16 });
  }, [routeGeometry, ready]);

  /* ── Recentre when the house pin is placed or moved ───────────────────── */

  useEffect(() => {
    if (!map.current || !pin) return;
    map.current.easeTo({ center: [pin.lng, pin.lat], zoom: Math.max(map.current.getZoom(), 14) });
  }, [pin]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200">
      <div ref={container} className={`w-full ${className}`} />
      {!tilesEnabled ? (
        <p className="absolute inset-x-0 bottom-0 bg-amber-50/95 px-3 py-2 text-xs text-amber-800">
          No basemap: set <code className="font-mono">BARIKOI_API_KEY</code> on the server to draw
          streets. Pins and locations still work.
        </p>
      ) : null}
    </div>
  );
}

/** Popups take an HTML string, so anything a resident typed has to be escaped
 * on the way in — a shop called `<img onerror=…>` is otherwise script on the
 * page for everyone in the house. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
