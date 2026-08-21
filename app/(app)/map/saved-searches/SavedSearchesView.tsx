"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge, Card, EmptyState, ErrorNote, secondaryButtonClass } from "@/components/ui";

type SavedSearch = {
  id: string;
  label: string;
  originAddress: string;
  maxCommuteMinutes: number;
  mode: string;
  createdAt: string;
  newMatches: { id: string; title: string; rent: number }[];
};

const MODE_LABELS: Record<string, string> = { "driving-car": "Driving", "foot-walking": "Walking" };

/**
 * "New matches" here are computed live against `lastViewedAt` (no
 * notification system exists anywhere in this app) and the watermark bumps
 * forward as soon as this page's GET resolves — so a search's badge count
 * reflects "new since your last visit to this page," not "new since ever."
 */
export function SavedSearchesView() {
  const [searches, setSearches] = useState<SavedSearch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/map/saved-searches")
      .then((res) => res.json())
      .then((body) => setSearches(body.searches ?? []))
      .catch(() => setError("Could not load your saved searches."));
  }, []);

  async function remove(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/map/saved-searches?id=${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      setError("Could not remove that search.");
      return;
    }
    setSearches((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
  }

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!searches) return <p className="text-sm text-slate-500">Loading…</p>;
  if (searches.length === 0) {
    return (
      <EmptyState
        title="No saved searches yet"
        hint={
          <>
            Set an origin and commute budget on the{" "}
            <Link href="/map" className="text-brand-700 underline">
              listings map
            </Link>{" "}
            and save it to get alerted about new matches here.
          </>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {searches.map((s) => (
        <Card key={s.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-medium text-slate-900">{s.label}</h2>
              <p className="text-sm text-slate-600">
                Within {s.maxCommuteMinutes} min {MODE_LABELS[s.mode] ?? s.mode} of {s.originAddress}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {s.newMatches.length > 0 ? (
                <Badge tone="green">
                  {s.newMatches.length} new match{s.newMatches.length === 1 ? "" : "es"}
                </Badge>
              ) : null}
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => remove(s.id)}
                disabled={busyId === s.id}
              >
                {busyId === s.id ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>

          {s.newMatches.length > 0 ? (
            <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
              {s.newMatches.map((m) => (
                <li key={m.id} className="text-sm">
                  <Link href={`/listings/${m.id}`} className="text-brand-700 hover:underline">
                    {m.title}
                  </Link>
                  <span className="ml-1.5 text-xs text-slate-500">৳{m.rent.toLocaleString()}/month</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
