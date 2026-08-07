"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, ErrorNote, buttonClass, secondaryButtonClass } from "@/components/ui";
import type { Favorite, Listing } from "@/lib/supabase/types";

type FavoriteWithListing = Favorite & { listings: Listing | null };

export function FavoriteList({ favorites }: { favorites: FavoriteWithListing[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(listingId: string) {
    setBusy(listingId);
    setError(null);
    const res = await fetch(`/api/favorites?listing_id=${listingId}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Could not remove");
      return;
    }
    router.refresh();
  }

  async function requestToJoin(listingId: string) {
    setBusy(listingId);
    setError(null);
    const res = await fetch("/api/join-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing_id: listingId }),
    });
    const body = await res.json();
    setBusy(null);
    if (!res.ok) setError(body.error ?? "Could not send request");
    else router.push("/join-requests");
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {favorites.map((favorite) => {
          const listing = favorite.listings;
          if (!listing) return null;
          return (
            <Card key={favorite.id}>
              <h2 className="font-medium text-slate-900">{listing.title}</h2>
              <p className="text-sm text-slate-600">
                BDT {Number(listing.rent).toLocaleString()}/month · {listing.area}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={busy === listing.id}
                  onClick={() => remove(listing.id)}
                >
                  Remove
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy === listing.id}
                  onClick={() => requestToJoin(listing.id)}
                >
                  Request to join
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
