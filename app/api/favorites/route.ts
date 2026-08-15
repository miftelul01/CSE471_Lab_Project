import { badRequest, notFound, ok, readJson, withUser } from "@/lib/api";
import { listingVisibilityFilter } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

/** M1.2 — saved listings (Mahia Tanzin). Private to their owner. */

export const dynamic = "force-dynamic";

/**
 * The columns the favourites list renders.
 *
 * Spelled out rather than `listing: true`, which returned the whole row —
 * including `removedReason` and `removedById`, the moderator's private notes
 * on why a listing was taken down.
 */
const LISTING_CARD = {
  id: true,
  title: true,
  description: true,
  rent: true,
  area: true,
  address: true,
  roomType: true,
  capacity: true,
  amenities: true,
  latitude: true,
  longitude: true,
  isActive: true,
  status: true,
  createdAt: true,
} as const;

/**
 * Saved listings, filtered by the same visibility rule as search.
 *
 * A favourite is a pointer, not a licence: bookmarking a room before it was
 * delisted (or removed by an administrator for breaking the rules) must not
 * keep it readable afterwards. This route previously joined the listing with
 * no filter at all, which quietly re-opened everything
 * listingVisibilityFilter exists to close.
 *
 * Rows whose listing is no longer visible are dropped from the response rather
 * than returned hollow — the star can be re-added if the room comes back.
 */
export const GET = withUser(async (user) => {
  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id, listing: listingVisibilityFilter(user) },
    include: { listing: { select: LISTING_CARD } },
    orderBy: { createdAt: "desc" },
  });
  return ok({ favorites });
});

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<{ listing_id: string }>(req);
  if (!body?.listing_id) return badRequest("listing_id is required");

  // You can only save something you're allowed to see. Without this, a known
  // id could be starred after removal and then read back through GET.
  const listing = await prisma.listing.findFirst({
    where: { id: body.listing_id, ...listingVisibilityFilter(user) },
    select: { id: true },
  });
  if (!listing) return notFound("No such listing");

  // Saving twice is a no-op rather than a 400 — that's what the star button
  // in the UI actually means.
  const favorite = await prisma.favorite.upsert({
    where: { userId_listingId: { userId: user.id, listingId: listing.id } },
    create: { userId: user.id, listingId: listing.id },
    update: {},
  });
  return ok(favorite, 201);
});

export const DELETE = withUser(async (user, req: Request) => {
  const listingId = new URL(req.url).searchParams.get("listing_id");
  if (!listingId) return badRequest("listing_id query parameter is required");

  await prisma.favorite.deleteMany({ where: { userId: user.id, listingId } });
  return ok({ removed: true });
});
