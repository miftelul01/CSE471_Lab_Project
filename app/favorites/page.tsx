"use client";

import { useEffect, useState } from "react";
import { useCurrentUserId } from "@/lib/useCurrentUserId";
import { UserIdBanner } from "@/components/UserIdBanner";

interface FavoriteRow {
  id: string;
  listing: { id: string; title: string; rent: number; area: string; roomType: string };
}

export default function FavoritesPage() {
  const { userId } = useCurrentUserId();
  const [favorites, setFavorites] = useState<FavoriteRow[]>([]);

  function load() {
    if (!userId) return;
    fetch(`/api/favorites?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => setFavorites(data.favorites ?? []));
  }

  useEffect(load, [userId]);

  async function remove(listingId: string) {
    await fetch("/api/favorites", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, listingId }),
    });
    load();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Favorites</h1>
      <UserIdBanner />

      {userId && favorites.length === 0 && (
        <p className="text-sm text-slate-500">No favorites saved yet.</p>
      )}

      <ul className="space-y-3">
        {favorites.map((f) => (
          <li key={f.id} className="rounded border bg-white p-4 flex justify-between items-center">
            <div>
              <p className="font-medium">{f.listing.title}</p>
              <p className="text-sm text-slate-600">
                {f.listing.area} · {f.listing.roomType} · ৳{f.listing.rent}/mo
              </p>
            </div>
            <button
              onClick={() => remove(f.listing.id)}
              className="rounded border px-3 py-1 text-sm hover:bg-slate-50"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
