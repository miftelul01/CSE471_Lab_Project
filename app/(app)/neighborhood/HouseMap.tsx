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

/** Shown only if the basemap itself fails to load — a valid, empty style. */
const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#e8ede9" } }],
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
  styleUrl,
  onLongPress,
  livePin,
  draftPin,
  routeGeometry,
  className = "h-[28rem]",
}: {
  pin: Coords | null;
  markers: MapMarker[];
  /** Resolved server-side: our key-protecting proxy, or a keyless public basemap. */
  styleUrl: string;
  /** Enables drop-a-pin, used by house setup and by adding a place by hand. */
  onLongPress?: (coords: Coords) => void;
  /** Where the resident is right now, while a trip is being tracked. */
  livePin?: (Coords & { accuracyM?: number | null }) | null;
  draftPin?: Coords | null;
  /** [lng, lat] pairs from a directions call. */
  routeGeometry?: [number, number][] | null;
  className?: string;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const drawn = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [styleFailed, setStyleFailed] = useState(false);

  // Long-press needs the latest callback without tearing the map down and
  // rebuilding it every time the parent re-renders.
  const longPress = useRef(onLongPress);
  longPress.current = onLongPress;

  useEffect(() => {
    if (!container.current || map.current) return;

    const center = pin ?? FALLBACK_CENTER;
    const instance = new maplibregl.Map({
      container: container.current,
      style: styleUrl,
      center: [center.lng, center.lat],
      zoom: pin ? 14 : 11,
      attributionControl: { compact: true },
    });

    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    // Long-press to drop a pin, on both pointer types. `contextmenu` covers the
    // desktop right-click and, on most mobile browsers, the touch-and-hold.
    instance.on("contextmenu", (event: any) => {
      longPress.current?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });

    let touchTimer: ReturnType<typeof setTimeout> | null = null;
    instance.on("touchstart", (event: any) => {
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

    // A basemap that fails to load (offline, provider down, key revoked) must
    // not take the page with it. Swap in the blank style so the pins — which
    // are DOM markers drawn on top, not part of the style — still render, and
    // say why the streets are missing rather than showing a mute grey box.
    //
    // What counts as "failed" is the whole difficulty. MapLibre raises `error`
    // for anything it did not like, and most of it is survivable: one tile that
    // 404s, an icon missing from the sprite, or — the one that actually bit us
    // — a layer in the provider's own style pointing at a source-layer their
    // tileset does not ship. Barikoi's osm-liberty does exactly that
    // ("Barikoi Poi icons" references source-layer "office_11"), so every load
    // raised one error while the style was still settling, and the old check
    // below — any error, as long as isStyleLoaded() was not true yet — threw
    // away a perfectly good basemap on it, every single time, for everyone.
    //
    // The only thing worth blanking for is the style document itself never
    // arriving. That is what styleLoaded/the timeout below track; individual
    // resource errors are logged and otherwise ignored.
    const styleLoaded = { current: false };
    const failed = { current: false };
    let styleTimer: ReturnType<typeof setTimeout> | null = null;

    const declareFailure = () => {
      if (failed.current || styleLoaded.current) return;
      failed.current = true;
      setStyleFailed(true);
      instance.setStyle(BLANK_STYLE);
    };

    instance.on("style.load", () => {
      styleLoaded.current = true;
      if (styleTimer) clearTimeout(styleTimer);
      styleTimer = null;
    });

    // Backstop for the failure no error event describes usefully: a style
    // request that hangs, or one that fails at the network layer, where
    // MapLibre reports a bare Error indistinguishable from the harmless
    // validation warnings above. Without it a dead provider leaves a grey box
    // and no explanation for as long as the tab is open.
    styleTimer = setTimeout(declareFailure, 12000);

    instance.on("error", (event: any) => {
      const message = event.error?.message ?? String(event);
      console.warn("[m2.4 map]", message);
      // Only an HTTP refusal counts: a numeric status means a server answered
      // and said no — our own proxy returning 401/403/429/503, which is a real
      // "there will be no basemap". `sourceId` marks a source or tile problem,
      // which is never fatal on its own, and a status-less Error is either a
      // style-spec warning or a network fault, both left to the timer above.
      if (!styleLoaded.current && !event.sourceId && typeof event.error?.status === "number") {
        declareFailure();
      }
    });

    map.current = instance;

    return () => {
      cancelTouch();
      if (styleTimer) clearTimeout(styleTimer);
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

    // The resident's own position during a tracked trip. Deliberately a
    // different shape and colour from every other pin: it is the only marker
    // on this map that moves, and it must never be mistaken for a place.
    if (livePin) {
      const element = document.createElement("div");
      element.className = "relative flex items-center justify-center";
      element.title = "You are here";

      const halo = document.createElement("span");
      halo.className = "absolute h-6 w-6 animate-ping rounded-full bg-sky-500/40";
      const dot = document.createElement("span");
      dot.className = "h-3.5 w-3.5 rounded-full border-2 border-white bg-sky-600 shadow";
      element.append(halo, dot);

      drawn.current.push(
        new maplibregl.Marker({ element }).setLngLat([livePin.lng, livePin.lat]).addTo(instance)
      );
    }
  }, [pin, markers, draftPin, livePin]);

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
      {styleFailed ? (
        <p className="absolute inset-x-0 bottom-0 bg-amber-50/95 px-3 py-2 text-xs text-amber-800">
          Couldn&apos;t load the basemap — check your connection. Pins, notes and distances all
          still work.
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
