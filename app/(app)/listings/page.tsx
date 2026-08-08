import Link from "next/link";

import { ListingFilters } from "./ListingFilters";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listingVisibilityFilter } from "@/lib/authz";
import { ROOM_TYPE_LABELS } from "@/lib/listings";
import { prisma } from "@/lib/prisma";
import type { Prisma, RoomType } from "@prisma/client";

export const metadata = { title: "Listings — Smart Mess" };

/** Query-string keys stay snake_case; they're part of the shareable URL. */
type SearchParams = {
  q?: string;
  area?: string;
  min_rent?: string;
  max_rent?: string;
  room_type?: string;
  mine?: string;
};

/**
 * another area Property & Room Listing Engine.
 *
 * Queries Prisma directly rather than fetching our own /api/listings: this is
 * a Server Component, so an internal HTTP round-trip would only add latency.
 * The API route exists for the client side and for teammates' features.
 */
export default async function ListingsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();

  const isLandlord = user.profile.role !== "RESIDENT";
  const showMine = searchParams.mine === "true" && isLandlord;

  const filters: Prisma.ListingWhereInput[] = [];

  if (showMine) {
    // The owner's own view includes delisted rows so they can be restored.
    filters.push({ landlordId: user.id });
  } else {
    filters.push({ isActive: true }, listingVisibilityFilter(user));
  }

  if (searchParams.area) {
    filters.push({ area: { contains: searchParams.area, mode: "insensitive" } });
  }
  if (searchParams.min_rent) filters.push({ rent: { gte: Number(searchParams.min_rent) } });
  if (searchParams.max_rent) filters.push({ rent: { lte: Number(searchParams.max_rent) } });
  if (searchParams.room_type) filters.push({ roomType: searchParams.room_type as RoomType });
  if (searchParams.q) {
    filters.push({
      OR: [
        { title: { contains: searchParams.q, mode: "insensitive" } },
        { description: { contains: searchParams.q, mode: "insensitive" } },
      ],
    });
  }

  const listings = await prisma.listing.findMany({
    where: { AND: filters },
    include: { house: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title={showMine ? "My listings" : "Find a room"}
        subtitle={
          showMine
            ? "Everything you've posted, including delisted properties."
            : "Search available rooms and houses by budget, area and room type."
        }
        action={
          isLandlord ? (
            <div className="flex gap-2">
              <Link
                href={showMine ? "/listings" : "/listings?mine=true"}
                className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {showMine ? "Browse all" : "My listings"}
              </Link>
              <LinkButton href="/listings/new">Post a listing</LinkButton>
            </div>
          ) : null
        }
      />

      <div className="mb-6">
        <ListingFilters />
      </div>

      {listings.length === 0 ? (
        <EmptyState
          title={showMine ? "You haven't posted anything yet" : "No listings match those filters"}
          hint={
            showMine ? (
              <Link href="/listings/new" className="underline">
                Post your first listing
              </Link>
            ) : (
              "Try widening the budget range or clearing the area."
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <Link key={listing.id} href={`/listings/${listing.id}`} className="block">
              <Card className="flex h-full flex-col transition hover:border-slate-400">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h2 className="font-medium text-slate-900">{listing.title}</h2>
                  {listing.isActive ? null : <Badge tone="amber">Delisted</Badge>}
                </div>

                <p className="text-sm font-medium text-slate-900">
                  BDT {Number(listing.rent).toLocaleString()}
                  <span className="font-normal text-slate-500">/month</span>
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  {listing.area} · {ROOM_TYPE_LABELS[listing.roomType]}
                </p>

                {listing.description ? (
                  <p className="mt-2 line-clamp-2 text-sm text-slate-500">{listing.description}</p>
                ) : null}

                {listing.amenities.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {listing.amenities.slice(0, 3).map((amenity) => (
                      <Badge key={amenity}>{amenity}</Badge>
                    ))}
                    {listing.amenities.length > 3 ? (
                      <Badge>+{listing.amenities.length - 3}</Badge>
                    ) : null}
                  </div>
                ) : null}

                <p className="mt-auto pt-3 text-xs text-slate-400">
                  Sleeps {listing.capacity}
                  {listing.house ? ` · ${listing.house.name}` : ""}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
