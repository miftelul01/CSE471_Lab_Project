"use client";

import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import "maplibre-gl/dist/maplibre-gl.css";

/**
 * The map canvas for M3.3 — property discovery for prospective tenants.
 *
 * Distinct from M2.4's HouseMap.tsx in one structural way: this one needs
 * native MapLibre clustering (a listings search can return far more pins
 * than a single household's bookmark list ever would), which means listings
 * live in a GeoJSON source with data-driven circle/symbol layers rather than
 * individual maplibregl.Marker DOM elements. Same style-loading, same
 * graceful "basemap failed" fallback as the rest of this app's maps.
 */

export type ListingPoint = {
  id: string;
  title: string;
  rent: number;
  roomType: string;
  lat: number;
  lng: number;
  locationUnlocked: boolean;
  commuteMinutes: number | null;
};

const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#e8ede9" } }],
};

/** Dhaka, for a first load with no listings to centre on yet. */
const FALLBACK_CENTER = { lat: 23.8103, lng: 90.4125 };

const SOURCE_ID = "m33-listings";

export function ListingsMapCanvas({
  listings,
  styleUrl,
  onSelect,
  onStyleFailed,
  /** Set to a { lat, lng } pair to re-centre and zoom to street level — the
   * free, cartographic stand-in for a photographic Street View preview (no
   * key is configured for a provider that would offer one). */
  focusPoint,
  className = "h-[32rem]",
}: {
  listings: ListingPoint[];
  styleUrl: string;
  onSelect?: (listingId: string) => void;
  onStyleFailed?: (failed: boolean) => void;
  focusPoint?: { lat: number; lng: number } | null;
  className?: string;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [styleFailed, setStyleFailed] = useState(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    if (!container.current || map.current) return;

    const first = listings[0];
    const center = first ? { lat: first.lat, lng: first.lng } : FALLBACK_CENTER;
    const instance = new maplibregl.Map({
      container: container.current,
      style: styleUrl,
      center: [center.lng, center.lat],
      zoom: listings.length > 0 ? 12 : 11,
      attributionControl: { compact: true },
    });

    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    instance.on("load", () => setReady(true));

    // A basemap that fails to load must not take pins/clustering down with
    // it — swap to a blank style, same idiom as M2.4's HouseMap.
    instance.on("error", (event: unknown) => {
      const message = (event as { error?: { message?: string } }).error?.message ?? String(event);
      console.warn("[m3.3 map]", message);
      if (!instance.isStyleLoaded() && !styleFailed) {
        setStyleFailed(true);
        onStyleFailed?.(true);
        instance.setStyle(BLANK_STYLE);
      }
    });

    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
    };
    // Built once. Data updates are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Clustered listing points ─────────────────────────────────────────── */

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;

    const data: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: "FeatureCollection",
      features: listings.map((l) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [l.lng, l.lat] },
        properties: {
          id: l.id,
          title: l.title,
          rent: l.rent,
          roomType: l.roomType,
          commuteMinutes: l.commuteMinutes,
          locationUnlocked: l.locationUnlocked,
        },
      })),
    };

    const existing = instance.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data);
      return;
    }

    instance.addSource(SOURCE_ID, {
      type: "geojson",
      data,
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50,
    });

    instance.addLayer({
      id: "m33-clusters",
      type: "circle",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#1f6f5c",
        "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 30, 26],
        "circle-opacity": 0.85,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
    instance.addLayer({
      id: "m33-cluster-count",
      type: "symbol",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      layout: { "text-field": "{point_count_abbreviated}", "text-size": 12, "text-font": ["Noto Sans Bold"] },
      paint: { "text-color": "#ffffff" },
    });
    instance.addLayer({
      id: "m33-unclustered",
      type: "circle",
      source: SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["case", ["get", "locationUnlocked"], "#1f6f5c", "#94a89f"],
        "circle-radius": 9,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });

    instance.on("click", "m33-clusters", (event) => {
      const features = instance.queryRenderedFeatures(event.point, { layers: ["m33-clusters"] });
      const clusterId = features[0]?.properties?.cluster_id;
      if (clusterId == null) return;
      (instance.getSource(SOURCE_ID) as maplibregl.GeoJSONSource)
        .getClusterExpansionZoom(clusterId)
        .then((zoom) => {
          const geometry = features[0].geometry as GeoJSON.Point;
          instance.easeTo({ center: geometry.coordinates as [number, number], zoom });
        });
    });

    instance.on("click", "m33-unclustered", (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const props = feature.properties as { id: string; title: string; rent: number; commuteMinutes: number | null };
      const geometry = feature.geometry as GeoJSON.Point;
      const [lng, lat] = geometry.coordinates as [number, number];

      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({ offset: 12, closeButton: true })
        .setLngLat([lng, lat])
        .setHTML(
          `<div style="font-size:12px;line-height:1.5">
             <strong>${escapeHtml(props.title)}</strong><br />
             <span style="color:#64748b">৳${Number(props.rent).toLocaleString()}/month${
            props.commuteMinutes != null ? ` &middot; ~${props.commuteMinutes} min commute` : ""
          }</span><br />
             <a href="/listings/${escapeHtml(props.id)}" style="color:#1f6f5c">View listing</a>
           </div>`
        )
        .addTo(instance);

      select.current?.(props.id);
    });

    instance.on("mouseenter", "m33-unclustered", () => (instance.getCanvas().style.cursor = "pointer"));
    instance.on("mouseleave", "m33-unclustered", () => (instance.getCanvas().style.cursor = ""));
    instance.on("mouseenter", "m33-clusters", () => (instance.getCanvas().style.cursor = "pointer"));
    instance.on("mouseleave", "m33-clusters", () => (instance.getCanvas().style.cursor = ""));
  }, [listings, ready]);

  /* ── Street-level zoom (Street View stand-in) ─────────────────────────── */

  useEffect(() => {
    if (!map.current || !ready || !focusPoint) return;
    map.current.easeTo({ center: [focusPoint.lng, focusPoint.lat], zoom: 18 });
  }, [focusPoint, ready]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200">
      <div ref={container} className={`w-full ${className}`} />
      {styleFailed ? (
        <p className="absolute inset-x-0 bottom-0 bg-amber-50/95 px-3 py-2 text-xs text-amber-800">
          Couldn&apos;t load the basemap — check your connection. Pins still work; see the list
          below the map as a fallback.
        </p>
      ) : null}
    </div>
  );
}

/** A popup takes an HTML string, so a landlord-typed title has to be escaped
 * on the way in — a title like `<img onerror=…>` is otherwise script on the
 * page for every visitor. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
