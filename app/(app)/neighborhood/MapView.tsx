"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AddBookmarkForm } from "./AddBookmarkForm";
import { HouseMap } from "./HouseMap";
import { Badge, Card } from "@/components/ui";
import {
  BOOKMARK_CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  formatStraightLine,
  type BookmarkView,
  type Coords,
} from "@/lib/neighborhood";
import type { BookmarkCategory } from "@prisma/client";

/**
 * The browse view: every pin the house has, colour-coded, filterable.
 *
 * Filtering happens entirely client-side over data already fetched — a chip
 * click must not cost a request, let alone a provider call. Entries with no
 * coordinates and online-only ones are listed beside the map rather than
 * dropped, because "we know this place but nobody has located it" is useful
 * information and an invitation to fix it.
 */
export function MapView({
  pin,
  placed,
  online,
  tilesEnabled,
}: {
  pin: Coords | null;
  placed: BookmarkView[];
  online: BookmarkView[];
  tilesEnabled: boolean;
}) {
  const [active, setActive] = useState<Set<BookmarkCategory>>(new Set());
  // Long-press drops a pin here and the add form picks it up, which is how a
  // stall with no entry in any gazetteer gets onto the map at all.
  const [draftPin, setDraftPin] = useState<Coords | null>(null);

  const present = useMemo(() => {
    const counts = new Map<BookmarkCategory, number>();
    for (const view of [...placed, ...online]) {
      counts.set(view.category, (counts.get(view.category) ?? 0) + 1);
    }
    return counts;
  }, [placed, online]);

  const visible = useMemo(
    () => (active.size === 0 ? placed : placed.filter((view) => active.has(view.category))),
    [placed, active]
  );

  const mappable = visible.filter((view) => view.lat !== null && view.lng !== null);
  const unlocated = visible.filter((view) => view.lat === null);

  function toggle(category: BookmarkCategory) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActive(new Set())}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              active.size === 0
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            All {placed.length}
          </button>

          {BOOKMARK_CATEGORIES.filter((category) => present.has(category)).map((category) => {
            const on = active.has(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggle(category)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                  on ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLORS[category] }}
                />
                {CATEGORY_LABELS[category]}
                <span className={on ? "text-white/60" : "text-slate-400"}>
                  {present.get(category)}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <HouseMap
        pin={pin}
        tilesEnabled={tilesEnabled}
        onLongPress={setDraftPin}
        draftPin={draftPin}
        markers={mappable.map((view) => ({
          id: view.id,
          name: view.name,
          category: view.category,
          lat: view.lat,
          lng: view.lng,
          activeDealCount: view.activeDealCount,
          href: `/neighborhood/places/${view.id}`,
        }))}
        className="h-[32rem]"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {mappable.length} pin{mappable.length === 1 ? "" : "s"} shown
          {pin ? "" : " — set your house pin to see distances"}. An amber badge means the place has
          a live deal.{" "}
          {draftPin
            ? `New pin dropped at ${draftPin.lat.toFixed(5)}, ${draftPin.lng.toFixed(5)} — fill in the form below.`
            : "Long-press the map to drop a pin for somewhere with no listing of its own."}
        </p>
      </div>

      <AddBookmarkForm draftPin={draftPin} onDraftPinChange={setDraftPin} />

      {unlocated.length > 0 ? (
        <Card>
          <h2 className="text-sm font-semibold text-slate-900">Saved without a location</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            These can&apos;t be drawn or ranked by distance until someone pins them.
          </p>
          <ul className="mt-2 divide-y divide-slate-100">
            {unlocated.map((view) => (
              <li key={view.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <Link
                  href={`/neighborhood/places/${view.id}`}
                  className="text-slate-800 hover:text-brand-700"
                >
                  {view.name}
                </Link>
                <Badge tone="slate">{CATEGORY_LABELS[view.category]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {online.length > 0 ? (
        <Card>
          <h2 className="text-sm font-semibold text-slate-900">Online &amp; delivery</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Deliberately not on the map — they come to you, so a pin would say nothing true.
          </p>
          <ul className="mt-2 divide-y divide-slate-100">
            {online.map((view) => (
              <li key={view.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <Link
                  href={`/neighborhood/places/${view.id}`}
                  className="text-slate-800 hover:text-brand-700"
                >
                  {view.name}
                </Link>
                <Badge tone="slate">{CATEGORY_LABELS[view.category]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {pin && mappable.length > 0 ? (
        <p className="text-xs text-slate-400">
          Nearest: {mappable[0].name},{" "}
          {mappable[0].distanceKm !== null ? formatStraightLine(mappable[0].distanceKm) : "unranked"}
        </p>
      ) : null}
    </div>
  );
}
