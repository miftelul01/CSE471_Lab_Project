"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  buttonClass,
  secondaryButtonClass,
} from "@/components/ui";
import type { Listing, Match } from "@prisma/client";

type MatchWithListing = Match & { listing: Listing | null };

export function MatchList() {
  const [matches, setMatches] = useState<MatchWithListing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  // GET /api/matches re-runs the engine, so this doubles as the refresh action.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/matches");
    const body = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Could not load matches");
      return;
    }
    setMatches(body.matches ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(url: string, payload: unknown, id: string) {
    setActing(id);
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    setActing(null);
    if (!res.ok) setError(body.error ?? "Request failed");
  }

  if (loading) return <p className="text-sm text-slate-500">Running the matching engine…</p>;

  return (
    <div className="space-y-4">
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <button type="button" onClick={load} className={secondaryButtonClass}>
        Re-run matching
      </button>

      {matches.length === 0 ? (
        <EmptyState
          title="No matches yet"
          hint="There are no active listings to match against. Ask a landlord to post one, or run the seed script."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {matches.map((match) => {
            const listing = match.listing;
            if (!listing) return null;
            return (
              <Card key={match.id}>
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h2 className="font-medium text-slate-900">{listing.title}</h2>
                  <Badge tone={Number(match.compatibilityScore) >= 0.8 ? "green" : "slate"}>
                    {Math.round(Number(match.compatibilityScore) * 100)}% match
                  </Badge>
                </div>
                <p className="text-sm text-slate-600">
                  BDT {Number(listing.rent).toLocaleString()}/month · {listing.area} ·{" "}
                  {listing.roomType.toLowerCase().replace("_", " ")}
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-slate-500">{listing.description}</p>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    disabled={acting === match.id}
                    onClick={() =>
                      act("/api/favorites", { listing_id: listing.id }, match.id)
                    }
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={acting === match.id}
                    onClick={() =>
                      act("/api/join-requests", { listing_id: listing.id }, match.id)
                    }
                  >
                    Request to join
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
