import Link from "next/link";
import { notFound } from "next/navigation";

import { ListingActions } from "./ListingActions";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ROOM_TYPE_LABELS } from "@/lib/listings";
import { prisma } from "@/lib/prisma";

export async function generateMetadata({ params }: { params: { id: string } }) {
  const listing = await prisma.listing.findUnique({
    where: { id: params.id },
    select: { title: true },
  });
  return { title: listing ? `${listing.title} — Smart Mess` : "Listing — Smart Mess" };
}

/** another area — listing detail. */
export default async function ListingDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const listing = await prisma.listing.findUnique({
    where: { id: params.id },
    include: {
      house: { select: { id: true, name: true } },
      landlord: { select: { name: true, email: true, phone: true } },
    },
  });

  if (!listing) notFound();

  const isOwner = listing.landlordId === user.id;

  // Fetched server-side so the buttons render in the right state on first
  // paint rather than flickering after a client-side check.
  const [favorite, joinRequest] = await Promise.all([
    prisma.favorite.findUnique({
      where: { userId_listingId: { userId: user.id, listingId: listing.id } },
      select: { id: true },
    }),
    prisma.joinRequest.findFirst({
      where: { userId: user.id, listingId: listing.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    }),
  ]);

  const hasLifestyle =
    listing.sleepSchedule !== null ||
    listing.cleanliness !== null ||
    listing.allowsSmoking !== null ||
    listing.allowsPets !== null;

  return (
    <div className="max-w-4xl">
      <Link href="/listings" className="mb-4 inline-block text-sm text-slate-600 hover:underline">
        ← Back to listings
      </Link>

      <PageHeader
        title={listing.title}
        subtitle={
          <>
            {listing.area}
            {listing.address ? ` · ${listing.address}` : ""} ·{" "}
            {ROOM_TYPE_LABELS[listing.roomType]}
          </>
        }
        action={
          listing.isActive ? (
            <Badge tone="green">Available</Badge>
          ) : (
            <Badge tone="amber">Delisted</Badge>
          )
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <Card>
            <p className="text-2xl font-semibold text-slate-900">
              BDT {Number(listing.rent).toLocaleString()}
              <span className="text-base font-normal text-slate-500">/month</span>
            </p>
            <p className="mt-1 text-sm text-slate-600">Sleeps up to {listing.capacity}</p>

            {listing.description ? (
              <p className="mt-4 whitespace-pre-line text-sm text-slate-700">
                {listing.description}
              </p>
            ) : null}
          </Card>

          {listing.amenities.length > 0 ? (
            <Card>
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Amenities</h2>
              <div className="flex flex-wrap gap-1.5">
                {listing.amenities.map((amenity) => (
                  <Badge key={amenity}>{amenity}</Badge>
                ))}
              </div>
            </Card>
          ) : null}

          {hasLifestyle ? (
            <Card>
              <h2 className="mb-2 text-sm font-semibold text-slate-900">House lifestyle</h2>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                {listing.sleepSchedule ? (
                  <div>
                    <dt className="text-slate-500">Sleep schedule</dt>
                    <dd className="text-slate-900">
                      {listing.sleepSchedule.toLowerCase().replace("_", " ")}
                    </dd>
                  </div>
                ) : null}
                {listing.cleanliness ? (
                  <div>
                    <dt className="text-slate-500">Cleanliness</dt>
                    <dd className="text-slate-900">
                      {listing.cleanliness.toLowerCase().replace("_", " ")}
                    </dd>
                  </div>
                ) : null}
                {listing.allowsSmoking !== null ? (
                  <div>
                    <dt className="text-slate-500">Smoking</dt>
                    <dd className="text-slate-900">
                      {listing.allowsSmoking ? "Allowed" : "Not allowed"}
                    </dd>
                  </div>
                ) : null}
                {listing.allowsPets !== null ? (
                  <div>
                    <dt className="text-slate-500">Pets</dt>
                    <dd className="text-slate-900">
                      {listing.allowsPets ? "Allowed" : "Not allowed"}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-slate-900">
              {isOwner ? "Manage" : "Interested?"}
            </h2>
            <ListingActions
              listingId={listing.id}
              isOwner={isOwner}
              isActive={listing.isActive}
              isFavorited={Boolean(favorite)}
              existingRequestStatus={joinRequest?.status ?? null}
            />
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Landlord</h2>
            <p className="text-sm text-slate-900">{listing.landlord.name || "—"}</p>
            {listing.landlord.phone ? (
              <p className="text-sm text-slate-600">{listing.landlord.phone}</p>
            ) : null}
            <p className="text-sm text-slate-600">{listing.landlord.email}</p>
            {listing.house ? (
              <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                Part of <span className="text-slate-700">{listing.house.name}</span>
              </p>
            ) : null}
          </Card>

          {listing.latitude !== null && listing.longitude !== null ? (
            <Card>
              <h2 className="mb-1 text-sm font-semibold text-slate-900">Location</h2>
              <p className="font-mono text-xs text-slate-600">
                {listing.latitude}, {listing.longitude}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                The embedded map is part of another area — see{" "}
                <Link href="/map" className="underline">
                  the map view
                </Link>
                .
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
