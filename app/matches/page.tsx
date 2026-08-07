"use client";

import { useEffect, useState } from "react";
import { useCurrentUserId } from "@/lib/useCurrentUserId";
import { UserIdBanner } from "@/components/UserIdBanner";

interface MatchRow {
  id: string;
  rank: number;
  compatibilityScore: number;
  listing: {
    id: string;
    title: string;
    rent: number;
    area: string;
    roomType: string;
  };
}

export default function MatchesPage() {
  const { userId } = useCurrentUserId();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetch(`/api/matches?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => setMatches(data.matches ?? []))
      .finally(() => setLoading(false));
  }, [userId]);

  async function saveFavorite(listingId: string) {
    await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, listingId }),
    });
  }

  async function sendJoinRequest(listingId: string) {
    await fetch("/api/join-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, listingId }),
    });
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Suggested Matches</h1>
      <UserIdBanner />

      {loading && <p className="text-sm text-slate-500">Running the matching engine...</p>}
      {!loading && userId && matches.length === 0 && (
        <p className="text-sm text-slate-500">
          No matches yet — make sure you've saved your preferences and there are active listings.
        </p>
      )}

      <ul className="space-y-3">
        {matches.map((m) => (
          <li key={m.id} className="rounded border bg-white p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">
                  #{m.rank} {m.listing.title}
                </p>
                <p className="text-sm text-slate-600">
                  {m.listing.area} · {m.listing.roomType} · ৳{m.listing.rent}/mo
                </p>
              </div>
              <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium">
                {Math.round(m.compatibilityScore * 100)}% match
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => saveFavorite(m.listing.id)}
                className="rounded border px-3 py-1 text-sm hover:bg-slate-50"
              >
                Save to Favorites
              </button>
              <button
                onClick={() => sendJoinRequest(m.listing.id)}
                className="rounded bg-slate-900 px-3 py-1 text-sm text-white"
              >
                Send Join Request
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
