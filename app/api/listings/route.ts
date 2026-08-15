import { badRequest, missingFields, ok, readJson, withUser } from "@/lib/api";
import { assertCanCreateListing, isHouseAdmin, listingVisibilityFilter } from "@/lib/authz";
import { createHouseWithOwner } from "@/lib/houses";
import { ROOM_TYPES, validateListing, type ListingInput } from "@/lib/listings";
import { prisma } from "@/lib/prisma";
import type { Prisma, RoomType } from "@prisma/client";

/**
 * M1.1 Property & Room Listing Engine — Miftelul Mehebub.
 *
 * Browse/search is open to any signed-in user; posting is landlords only.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: Request) => {
  const params = new URL(req.url).searchParams;

  const filters: Prisma.ListingWhereInput[] = [];

  // "mine" is the landlord's dashboard: their own rows including delisted ones.
  if (params.get("mine") === "true") {
    filters.push({ landlordId: user.id });
  } else {
    // The visibility filter already covers both isActive and moderation —
    // adding another isActive check here is what previously let removed
    // listings leak back into search.
    filters.push(listingVisibilityFilter(user));
  }

  const area = params.get("area");
  const minRent = params.get("min_rent");
  const maxRent = params.get("max_rent");
  const roomType = params.get("room_type");
  const search = params.get("q");

  if (area) filters.push({ area: { contains: area, mode: "insensitive" } });
  if (minRent) filters.push({ rent: { gte: Number(minRent) } });
  if (maxRent) filters.push({ rent: { lte: Number(maxRent) } });
  if (roomType) {
    // An unknown enum value reaches Postgres as an invalid cast and 500s, so
    // check it here and answer with a useful 400 instead.
    if (!ROOM_TYPES.includes(roomType as RoomType)) {
      return badRequest(`room_type must be one of: ${ROOM_TYPES.join(", ")}`);
    }
    filters.push({ roomType: roomType as RoomType });
  }
  if (search) {
    filters.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  const listings = await prisma.listing.findMany({
    where: { AND: filters },
    include: { house: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return ok({ listings });
});

export const POST = withUser(async (user, req: Request) => {
  assertCanCreateListing(user);

  const body = await readJson<ListingInput>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["title", "rent", "area", "roomType"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  const invalid = validateListing(body);
  if (invalid) return badRequest(invalid);

  // Every listing must belong to a house: accepting a join request admits the
  // applicant into the listing's house, so one without a house is a dead end.
  let houseId = body.houseId ?? null;

  if (houseId) {
    if (!(await isHouseAdmin(user.id, houseId))) {
      return badRequest("You don't administer that house.");
    }
  } else {
    const house = await createHouseWithOwner(
      {
        name: body.title,
        address: body.address || body.area,
        area: body.area,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
      },
      user.id,
      user.profile.role
    );
    houseId = house.id;
  }

  const listing = await prisma.listing.create({
    data: {
      // Never from the body: the owner is always the session user.
      landlordId: user.id,
      houseId,
      title: body.title,
      description: body.description ?? "",
      rent: Number(body.rent),
      area: body.area,
      address: body.address || null,
      roomType: body.roomType,
      capacity: Number(body.capacity ?? 1),
      amenities: body.amenities ?? [],
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      sleepSchedule: body.sleepSchedule ?? null,
      cleanlinessLevel: body.cleanlinessLevel ?? null,
      allowsSmoking: body.allowsSmoking ?? null,
      allowsPets: body.allowsPets ?? null,
      isActive: true,
    },
  });

  return ok(listing, 201);
});
