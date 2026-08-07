import Link from "next/link";

import { FavoriteList } from "./FavoriteList";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Favorite, Listing } from "@/lib/supabase/types";

export const metadata = { title: "Favorites — Smart Mess" };

/** M1.2 — saved listings (Mahia Tanzin). */
export default async function FavoritesPage() {
  const user = await requireUser();
  const supabase = createClient();

  const { data } = await supabase
    .from("favorites")
    .select("*, listings(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const favorites = (data as (Favorite & { listings: Listing | null })[] | null) ?? [];

  return (
    <div>
      <PageHeader
        title="Saved listings"
        subtitle={
          <>
            Shortlist from your{" "}
            <Link href="/matches" className="underline">
              suggested matches
            </Link>
            .
          </>
        }
      />
      {favorites.length === 0 ? (
        <EmptyState title="Nothing saved yet" hint="Hit Save on a match to shortlist it here." />
      ) : (
        <FavoriteList favorites={favorites} />
      )}
    </div>
  );
}
