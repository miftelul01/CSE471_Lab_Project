"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge, Card, ErrorNote, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { ListingsMapCanvas, type ListingPoint } from "./ListingsMapCanvas";

type ApiListing = {
  id: string;
  title: string;
  rent: number;
  roomType: string;
  capacity: number;
  area: string;
  approxLat: number | null;
  approxLng: number | null;
  exactLat: number | null;
  exactLng: number | null;
  locationUnlocked: boolean;
  commuteMinutes: number | null;
  commuteDistanceMetres: number | null;
  commuteEstimated: boolean | null;
};

type Mode = "driving-car" | "foot-walking";
const MODE_LABELS: Record<Mode, string> = { "driving-car": "Driving", "foot-walking": "Walking" };

type Suggestion = { name: string; address: string | null; lat: number | null; lng: number | null };
type Origin = { address: string; lat: number; lng: number } | null;

const AREA_SNAPSHOT_RADIUS_KM = 2;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function OriginInput({
  label,
  value,
  onChange,
  onPick,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (s: Suggestion) => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/map/geocode?q=${encodeURIComponent(value)}`);
      const body = await res.json();
      if (res.ok) setSuggestions(body.suggestions ?? []);
    }, 350);
    return () => clearTimeout(handle);
  }, [value]);

  return (
    <div className="relative">
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <input
        className={inputClass}
        value={value}
        placeholder="e.g. BRAC University, Mohakhali"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && suggestions.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-card">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  onPick(s);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{s.name}</span>
                {s.address ? <span className="block text-xs text-slate-500">{s.address}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ListingsMapView({ styleUrl }: { styleUrl: string }) {
  const [listings, setListings] = useState<ApiListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [routingConfigured, setRoutingConfigured] = useState(true);
  const [mapFailed, setMapFailed] = useState(false);

  const [mode, setMode] = useState<Mode>("driving-car");
  const [originAText, setOriginAText] = useState("");
  const [originA, setOriginA] = useState<Origin>(null);
  const [originBText, setOriginBText] = useState("");
  const [originB, setOriginB] = useState<Origin>(null);
  const [showSecondOrigin, setShowSecondOrigin] = useState(false);
  const [originBCommutes, setOriginBCommutes] = useState<Record<string, number | null>>({});

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [sortByCommute, setSortByCommute] = useState(false);

  const [saveLabel, setSaveLabel] = useState("");
  const [saveMinutes, setSaveMinutes] = useState("30");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (originA) {
      qs.set("originLat", String(originA.lat));
      qs.set("originLng", String(originA.lng));
      qs.set("mode", mode);
    }
    const res = await fetch(`/api/map/listings?${qs.toString()}`);
    const body = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Could not load the map");
      return;
    }
    setListings(body.listings ?? []);
    setRoutingConfigured(body.routingProviderConfigured ?? true);
  }, [originA, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  // Second origin's commute figures come from the batch endpoint, called
  // once per origin rather than looped per listing.
  useEffect(() => {
    if (!originB || listings.length === 0) {
      setOriginBCommutes({});
      return;
    }
    const ids = listings.map((l) => l.id).join(",");
    fetch(
      `/api/map/commute?originLat=${originB.lat}&originLng=${originB.lng}&mode=${mode}&listingIds=${ids}`
    )
      .then((res) => res.json())
      .then((body) => {
        const map: Record<string, number | null> = {};
        for (const c of body.commutes ?? []) map[c.listingId] = c.commuteMinutes;
        setOriginBCommutes(map);
      })
      .catch(() => setOriginBCommutes({}));
  }, [originB, listings, mode]);

  const mapPoints: ListingPoint[] = useMemo(
    () =>
      listings
        .filter((l) => l.approxLat != null && l.approxLng != null)
        .map((l) => ({
          id: l.id,
          title: l.title,
          rent: l.rent,
          roomType: l.roomType,
          lat: (l.locationUnlocked ? l.exactLat : l.approxLat)!,
          lng: (l.locationUnlocked ? l.exactLng : l.approxLng)!,
          locationUnlocked: l.locationUnlocked,
          commuteMinutes: l.commuteMinutes,
        })),
    [listings]
  );

  const sortedListings = useMemo(() => {
    if (!sortByCommute) return listings;
    return [...listings].sort((a, b) => (a.commuteMinutes ?? Infinity) - (b.commuteMinutes ?? Infinity));
  }, [listings, sortByCommute]);

  const selected = listings.find((l) => l.id === selectedId) ?? null;
  const snapshot = useMemo(() => {
    if (!selected || selected.approxLat == null || selected.approxLng == null) return null;
    const origin = { lat: selected.approxLat, lng: selected.approxLng };
    const nearby = listings.filter(
      (l) =>
        l.id !== selected.id &&
        l.approxLat != null &&
        l.approxLng != null &&
        haversineKm(origin, { lat: l.approxLat, lng: l.approxLng }) <= AREA_SNAPSHOT_RADIUS_KM
    );
    if (nearby.length === 0) return { count: 0, avgRent: null as number | null };
    const avgRent = Math.round(nearby.reduce((sum, l) => sum + l.rent, 0) / nearby.length);
    return { count: nearby.length, avgRent };
  }, [selected, listings]);

  async function saveSearch() {
    if (!originA || !saveLabel.trim()) return;
    setSaveMessage(null);
    const res = await fetch("/api/map/saved-searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: saveLabel.trim(),
        originAddress: originA.address,
        originLat: originA.lat,
        originLng: originA.lng,
        maxCommuteMinutes: Number(saveMinutes),
        mode,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setSaveMessage(body.error ?? "Could not save this search");
      return;
    }
    setSaveMessage("Saved — see it under Saved searches.");
    setSaveLabel("");
  }

  if (loading && listings.length === 0) return <p className="text-sm text-slate-500">Loading the map…</p>;

  return (
    <div className="space-y-4">
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <OriginInput
            label="Commute from"
            value={originAText}
            onChange={(v) => {
              setOriginAText(v);
              if (!v) setOriginA(null);
            }}
            onPick={(s) => {
              if (s.lat == null || s.lng == null) return;
              setOriginAText(s.name);
              setOriginA({ address: s.name, lat: s.lat, lng: s.lng });
            }}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Mode</label>
            <div className="flex gap-2">
              {(["driving-car", "foot-walking"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={m === mode ? buttonClass : secondaryButtonClass}
                  onClick={() => setMode(m)}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!routingConfigured && originA ? (
          <p className="mt-2 text-xs text-amber-700">
            No live routing provider is configured — commute figures below are straight-line
            estimates, not real road times.
          </p>
        ) : null}

        {showSecondOrigin ? (
          <div className="mt-3">
            <OriginInput
              label="Compare against a second origin"
              value={originBText}
              onChange={(v) => {
                setOriginBText(v);
                if (!v) setOriginB(null);
              }}
              onPick={(s) => {
                if (s.lat == null || s.lng == null) return;
                setOriginBText(s.name);
                setOriginB({ address: s.name, lat: s.lat, lng: s.lng });
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            className="mt-2 text-xs text-brand-700 underline"
            onClick={() => setShowSecondOrigin(true)}
          >
            + Compare against a second origin
          </button>
        )}

        {originA ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-600">Alert me to new listings within</label>
            <input
              type="number"
              min={1}
              max={180}
              className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm"
              value={saveMinutes}
              onChange={(e) => setSaveMinutes(e.target.value)}
            />
            <span className="text-xs text-slate-600">min of</span>
            <input
              className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-sm"
              placeholder="Label, e.g. Home"
              value={saveLabel}
              onChange={(e) => setSaveLabel(e.target.value)}
            />
            <button type="button" className={secondaryButtonClass} onClick={saveSearch} disabled={!saveLabel.trim()}>
              Save search
            </button>
            {saveMessage ? <span className="text-xs text-slate-500">{saveMessage}</span> : null}
          </div>
        ) : null}
      </Card>

      {mapFailed ? null : (
        <ListingsMapCanvas
          listings={mapPoints}
          styleUrl={styleUrl}
          onSelect={setSelectedId}
          onStyleFailed={setMapFailed}
          focusPoint={focusPoint}
        />
      )}

      {selected ? (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-medium text-slate-900">{selected.title}</h3>
              <p className="text-sm text-slate-600">
                ৳{selected.rent.toLocaleString()}/month · {selected.area} · {selected.capacity} seat
                {selected.capacity > 1 ? "s" : ""}
              </p>
            </div>
            <Link href={`/listings/${selected.id}`} className={secondaryButtonClass}>
              View listing
            </Link>
          </div>
          {snapshot ? (
            <p className="mt-2 text-xs text-slate-500">
              Area snapshot: {snapshot.count} other listing{snapshot.count === 1 ? "" : "s"} within{" "}
              {AREA_SNAPSHOT_RADIUS_KM} km
              {snapshot.avgRent != null ? `, averaging ৳${snapshot.avgRent.toLocaleString()}/month` : ""}.
            </p>
          ) : null}
          {selected.approxLat != null && selected.approxLng != null ? (
            <button
              type="button"
              className="mt-2 text-xs text-brand-700 underline"
              onClick={() =>
                setFocusPoint({
                  lat: (selected.locationUnlocked ? selected.exactLat : selected.approxLat)!,
                  lng: (selected.locationUnlocked ? selected.exactLng : selected.approxLng)!,
                })
              }
            >
              Zoom to street level
            </button>
          ) : null}
          {!selected.locationUnlocked ? (
            <p className="mt-2 text-xs text-slate-400">
              Showing an approximate location — the exact pin unlocks once you send a join request.
            </p>
          ) : null}
        </Card>
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">{sortedListings.length} listings</h2>
        {originA ? (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={sortByCommute} onChange={(e) => setSortByCommute(e.target.checked)} />
            Sort by commute
          </label>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {sortedListings.map((l) => (
          <Card key={l.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link href={`/listings/${l.id}`} className="font-medium text-slate-900 hover:underline">
                  {l.title}
                </Link>
                <p className="text-sm text-slate-600">
                  ৳{l.rent.toLocaleString()}/month · {l.area}
                </p>
              </div>
              {!l.locationUnlocked ? <Badge tone="slate">Approximate location</Badge> : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
              {l.commuteMinutes != null ? (
                <span>
                  {MODE_LABELS[mode]} from &ldquo;{originAText}&rdquo;: ~{l.commuteMinutes} min
                  {l.commuteEstimated ? " (estimate)" : ""}
                </span>
              ) : null}
              {originB && originBCommutes[l.id] != null ? (
                <span>
                  From &ldquo;{originBText}&rdquo;: ~{originBCommutes[l.id]} min
                </span>
              ) : null}
            </div>
            <button type="button" className="mt-2 text-xs text-brand-700 underline" onClick={() => setSelectedId(l.id)}>
              Details
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
