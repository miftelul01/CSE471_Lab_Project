"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, secondaryButtonClass } from "@/components/ui";
import {
  CATEGORY_LABELS,
  ROUTE_PROFILES,
  ROUTE_PROFILE_LABELS,
  formatStraightLine,
  type BookmarkView,
  type RouteProfile,
} from "@/lib/neighborhood";

/**
 * One place, as it appears in the need finder and in search results.
 *
 * Everything on this card is free. The distance is haversine from cached
 * coordinates, the freshness label is computed from timestamps already loaded,
 * and the deal count came from the same query. Nothing here costs a provider
 * call until somebody presses Get directions, which is the only control on the
 * card that can.
 */

export type DirectionsResult = {
  label: string;
  approximate: boolean;
  geometry: [number, number][] | null;
  reason?: string;
};

export function FreshnessLine({ view }: { view: BookmarkView }) {
  const tone =
    view.freshness.tone === "green" ? "green" : view.freshness.tone === "amber" ? "amber" : "slate";

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge tone={tone}>{view.freshness.label}</Badge>
      {view.freshness.confirmLabel ? (
        <span className="text-xs text-slate-500">{view.freshness.confirmLabel}</span>
      ) : null}
    </span>
  );
}

export function BookmarkCard({
  view,
  onRoute,
  showDirections = true,
}: {
  view: BookmarkView;
  /** Lets a parent draw the returned geometry on its map. */
  onRoute?: (result: DirectionsResult) => void;
  showDirections?: boolean;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<RouteProfile>("foot-walking");
  const [directions, setDirections] = useState<DirectionsResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function getDirections() {
    setBusy(true);
    setError(null);

    const response = await fetch("/api/neighborhood/directions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookmarkId: view.id, profile }),
    });
    const body = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(body.error ?? "Could not get directions.");
      return;
    }

    const result: DirectionsResult = {
      label: body.label,
      approximate: body.approximate,
      geometry: body.geometry,
      reason: body.reason,
    };
    setDirections(result);
    onRoute?.(result);
  }

  async function confirm(verdict: "STILL_THERE" | "GONE") {
    setBusy(true);
    setError(null);

    const response = await fetch(`/api/neighborhood/bookmarks/${view.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict }),
    });
    const body = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(body.error ?? "Could not save that.");
      return;
    }
    if (body.message) setError(body.message);
    router.refresh();
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/neighborhood/places/${view.id}`}
              className="font-medium text-slate-900 hover:text-brand-700"
            >
              {view.name}
            </Link>
            <Badge tone="slate">{CATEGORY_LABELS[view.category]}</Badge>
            {view.visibility === "PRIVATE" ? <Badge tone="blue">Only you</Badge> : null}
            {view.activeDealCount > 0 ? (
              <Badge tone="amber">
                {view.activeDealCount} deal{view.activeDealCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>

          {view.address ? (
            <p className="mt-0.5 truncate text-sm text-slate-600">{view.address}</p>
          ) : null}

          <div className="mt-2">
            <FreshnessLine view={view} />
          </div>
        </div>

        <div className="shrink-0 text-right">
          {view.isOnline ? (
            <span className="text-xs text-slate-500">Online / delivery</span>
          ) : view.distanceKm !== null ? (
            <span className="tabular text-sm font-medium text-slate-700">
              {formatStraightLine(view.distanceKm)}
            </span>
          ) : (
            <span className="text-xs text-slate-400">No location saved</span>
          )}
        </div>
      </div>

      {view.notes.length > 0 ? (
        <ul className="mt-3 space-y-1.5 border-l-2 border-slate-100 pl-3">
          {view.notes.slice(0, 2).map((note) => (
            <li key={note.id} className="text-sm text-slate-700">
              {note.body}
              <span className="ml-1.5 text-xs text-slate-400">— {note.authorName}</span>
            </li>
          ))}
          {view.noteCount > 2 ? (
            <li className="text-xs text-slate-500">
              <Link href={`/neighborhood/places/${view.id}`} className="hover:text-brand-700">
                +{view.noteCount - 2} more note{view.noteCount - 2 === 1 ? "" : "s"}
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {view.isOnline && view.onlineUrl ? (
          <a
            href={view.onlineUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={secondaryButtonClass}
          >
            Open link
          </a>
        ) : null}

        {showDirections && !view.isOnline && view.lat !== null ? (
          <>
            <select
              className="rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-700"
              value={profile}
              onChange={(event) => setProfile(event.target.value as RouteProfile)}
              aria-label="Travel mode"
            >
              {ROUTE_PROFILES.map((option) => (
                <option key={option} value={option}>
                  {ROUTE_PROFILE_LABELS[option]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={getDirections}
              disabled={busy}
            >
              {busy ? "…" : "Get directions"}
            </button>
          </>
        ) : null}

        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => confirm("STILL_THERE")}
          disabled={busy}
        >
          Still there
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => confirm("GONE")}
          disabled={busy}
        >
          Report gone
        </button>
      </div>

      {directions ? (
        <p className="mt-2 text-sm text-slate-700">
          {directions.label}
          {directions.approximate ? (
            <span className="ml-1.5 text-xs text-amber-700">
              approximate — {directions.reason ?? "routing unavailable, showing straight-line"}
            </span>
          ) : null}
        </p>
      ) : null}

      {error ? <p className="mt-2 text-sm text-amber-700">{error}</p> : null}
    </Card>
  );
}
