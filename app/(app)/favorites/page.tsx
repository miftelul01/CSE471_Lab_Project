import Link from "next/link";

import { FavoriteList } from "./FavoriteList";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Favorites — Smart Mess" };

/** another area — saved listings (Mahia Tanzin). Private to their owner. */
export default async function FavoritesPage() {
  const user = await requireUser();

  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id },
    include: { listing: true },
    orderBy: { createdAt: "desc" },
  });

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
        <FavoriteList
          favorites={favorites.map((f) => ({
            id: f.id,
            listing: f.listing && {
              id: f.listing.id,
              title: f.listing.title,
              rent: Number(f.listing.rent),
              area: f.listing.area,
            },
          }))}
        />
      )}
    </div>
  );
}
