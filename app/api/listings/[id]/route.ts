import { badRequest, notFound, ok, readJson, withUser } from "@/lib/api";
import { assertCanEditListing, listingVisibilityFilter } from "@/lib/authz";
import { validateListing, type ListingInput } from "@/lib/listings";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type Params = { params: { id: string } };

/** M1.1 Property & Room Listing Engine — Miftelul Mehebub. */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, _req: Request, { params }: Params) => {
  // Same visibility rule the search list uses — without it, a delisted room or
  // one an admin removed for breaking the rules is still fully readable (landlord
  // contact info included) to anyone who has or guesses its id.
  const listing = await prisma.listing.findFirst({
    where: { id: params.id, ...listingVisibilityFilter(user) },
    include: {
      house: { select: { id: true, name: true } },
      landlord: { select: { name: true, email: true, phone: true } },
    },
  });
  if (!listing) return notFound("No such listing");
  return ok(listing);
});

export const PATCH = withUser(async (user, req: Request, { params }: Params) => {
  // Replaces the "landlords update own listings" RLS policy. Without this the
  // update below would happily rewrite anyone's listing.
  await assertCanEditListing(user, params.id);

  const body = await readJson<Partial<ListingInput>>(req);
  if (!body) return badRequest("Invalid JSON body");

  const invalid = validateListing(body);
  if (invalid) return badRequest(invalid);

  // Whitelist: never spread the body, or a caller could send landlordId and
  // hand their listing to someone else.
  const data: Prisma.ListingUpdateInput = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.rent !== undefined) data.rent = Number(body.rent);
  if (body.area !== undefined) data.area = body.area;
  if (body.address !== undefined) data.address = body.address || null;
  if (body.roomType !== undefined) data.roomType = body.roomType;
  if (body.capacity !== undefined) data.capacity = Number(body.capacity);
  if (body.amenities !== undefined) data.amenities = body.amenities;
  if (body.latitude !== undefined) data.latitude = body.latitude;
  if (body.longitude !== undefined) data.longitude = body.longitude;
  if (body.sleepSchedule !== undefined) data.sleepSchedule = body.sleepSchedule;
  if (body.cleanliness !== undefined) data.cleanliness = body.cleanliness;
  if (body.allowsSmoking !== undefined) data.allowsSmoking = body.allowsSmoking;
  if (body.allowsPets !== undefined) data.allowsPets = body.allowsPets;
  // Allows re-listing something that was delisted.
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  if (Object.keys(data).length === 0) return badRequest("Nothing to update.");

  const listing = await prisma.listing.update({ where: { id: params.id }, data });
  return ok(listing);
});

/**
 * Delist rather than hard delete: matches, favourites and join requests all
 * reference this row, and a real delete would cascade them away — destroying a
 * resident's shortlist and application history along with the listing.
 */
export const DELETE = withUser(async (user, _req: Request, { params }: Params) => {
  await assertCanEditListing(user, params.id);
  const listing = await prisma.listing.update({
    where: { id: params.id },
    data: { isActive: false },
    select: { id: true },
  });
  return ok({ id: listing.id, delisted: true });
});
