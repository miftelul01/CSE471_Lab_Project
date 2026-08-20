"use client";

import { useEffect, useMemo, useState } from "react";

import { AddBookmarkForm } from "./AddBookmarkForm";
import { BookmarkCard } from "./BookmarkCard";
import { Card, EmptyState, inputClass } from "@/components/ui";
import {
  BOOKMARK_CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  categoryForNeed,
  type BookmarkView,
  type Coords,
} from "@/lib/neighborhood";
import type { BookmarkCategory } from "@prisma/client";

/**
 * The primary entry point: "I need X, where do we go?"
 *
 * Filtering runs against the list the server already sent, so picking a
 * category or typing a need is instant and costs nothing. Only a query that
 * finds nothing locally falls through to the trigram search endpoint — the
 * expensive-ish path is the rare one, not the default.
 *
 * Online and delivery entries are a separate group below rather than ranked
 * with the rest. Printing "5 km away" beside something that delivers to the
 * door would be a lie told by arrangement rather than by words.
 */
export function NeedFinder({
  placed,
  online,
  hasPin,
}: {
  placed: BookmarkView[];
  online: BookmarkView[];
  hasPin: boolean;
}) {
  const [need, setNeed] = useState("");
  const [category, setCategory] = useState<BookmarkCategory | null>(null);
  const [remote, setRemote] = useState<BookmarkView[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [draftPin, setDraftPin] = useState<Coords | null>(null);

  const query = need.trim().toLowerCase();

  const local = useMemo(() => {
    const matches = (view: BookmarkView) => {
      if (category && view.category !== category) return false;
      if (!query) return true;
      return (
        view.name.toLowerCase().includes(query) ||
        (view.address ?? "").toLowerCase().includes(query) ||
        CATEGORY_LABELS[view.category].toLowerCase().includes(query) ||
        view.notes.some((note) => note.body.toLowerCase().includes(query))
      );
    };

    // A typed need that names a category — "gas", "haircut" — filters by that
    // category even when no name contains the word.
    const guessed = query ? categoryForNeed(query) : null;
    const byGuess = (view: BookmarkView) =>
      guessed !== null && (!category || view.category === category) && view.category === guessed;

    return {
      placed: placed.filter((view) => matches(view) || byGuess(view)),
      online: online.filter((view) => matches(view) || byGuess(view)),
      guessed,
    };
  }, [placed, online, query, category]);

  // Falls through to the server's trigram search only when the local pass came
  // up empty — that is where Bangla / Banglish spelling variation gets caught.
  useEffect(() => {
    if (query.length < 2 || local.placed.length > 0 || local.online.length > 0) {
      setRemote(null);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/neighborhood/search?q=${encodeURIComponent(query)}`);
        const body = await response.json();
        setRemote(response.ok ? [...(body.results ?? []), ...(body.online ?? [])] : []);
      } catch {
        setRemote([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, local.placed.length, local.online.length]);

  const results = remote ?? local.placed;
  const onlineResults = remote ? [] : local.online;

  return (
    <div className="space-y-6">
      <Card>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">What do you need?</span>
          <input
            className={inputClass}
            value={need}
            onChange={(event) => setNeed(event.target.value)}
            placeholder="gas cylinder, kacha bazar, ওষুধ, haircut…"
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              category === null
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            All
          </button>
          {BOOKMARK_CATEGORIES.map((option) => {
            const count = placed.filter((v) => v.category === option).length +
              online.filter((v) => v.category === option).length;
            if (count === 0) return null;
            const active = category === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setCategory(active ? null : option)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                  active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLORS[option] }}
                />
                {CATEGORY_LABELS[option]}
                <span className={active ? "text-white/60" : "text-slate-400"}>{count}</span>
              </button>
            );
          })}
        </div>

        {local.guessed && !category ? (
          <p className="mt-2 text-xs text-slate-500">
            Reading that as <strong>{CATEGORY_LABELS[local.guessed]}</strong>.
          </p>
        ) : null}
      </Card>

      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            {hasPin ? "Nearest first" : "Places on your map"}
          </h2>
          <span className="text-xs text-slate-500">
            {searching ? "Searching…" : `${results.length} result${results.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {results.length === 0 ? (
          <EmptyState
            title={query || category ? "Nothing on the map for that yet" : "Your house map is empty"}
            hint={
              query || category
                ? "Add it below once you find it — the next person to move in inherits everything you pin."
                : "Add the places your flat actually uses: the bazar, the pharmacy, whoever brings the gas cylinders."
            }
          />
        ) : (
          <div className="space-y-3">
            {results.map((view) => (
              <BookmarkCard key={view.id} view={view} showDirections={hasPin} />
            ))}
          </div>
        )}
      </div>

      {onlineResults.length > 0 ? (
        <div>
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Online &amp; delivery</h2>
          <p className="mb-3 text-xs text-slate-500">
            No distance shown — these come to you, so ranking them by how far away they are would be
            meaningless.
          </p>
          <div className="space-y-3">
            {onlineResults.map((view) => (
              <BookmarkCard key={view.id} view={view} showDirections={false} />
            ))}
          </div>
        </div>
      ) : null}

      <AddBookmarkForm
        draftPin={draftPin}
        onDraftPinChange={setDraftPin}
        defaultCategory={category ?? local.guessed ?? undefined}
      />
    </div>
  );
}
