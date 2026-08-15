import { badRequest, missingFields, ok, readJson, withUser } from "@/lib/api";
import { requireActiveHouseId } from "@/lib/authz";
import {
  BOOKMARK_CATEGORIES,
  MAX_ADDRESS_LENGTH,
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_URL_LENGTH,
  categoryForNeed,
} from "@/lib/neighborhood";
import { findNearbyDuplicates, listBookmarks } from "@/lib/neighborhood.server";
import { prisma } from "@/lib/prisma";
import type { BookmarkCategory, Visibility } from "@prisma/client";

/**
 * M2.4 Shared House Map & Neighbourhood Knowledge Base — Miftelul Mehebub.
 *
 * The house whose map this reads and writes is derived from the session on
 * every single request. There is no houseId parameter on this route, and adding
 * one would turn the whole feature into an address book of other people's
 * homes.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: Request) => {
  const houseId = await requireActiveHouseId(user);
  const url = new URL(req.url);

  const rawCategory = url.searchParams.get("category");
  if (rawCategory && !BOOKMARK_CATEGORIES.includes(rawCategory as BookmarkCategory)) {
    return badRequest(`category must be one of: ${BOOKMARK_CATEGORIES.join(", ")}.`);
  }

  // "Type a need" resolves to a category when it can — someone typing "gas" is
  // asking for a cylinder supplier, not for the word "gas" in a shop name.
  const need = url.searchParams.get("need");
  const category = (rawCategory as BookmarkCategory | null) ?? (need ? categoryForNeed(need) : null);

  const list = await listBookmarks(user, houseId, {
    category,
    includeDeleted: url.searchParams.get("includeRemoved") === "true",
    mappableOnly: url.searchParams.get("mappable") === "true",
  });

  return ok({
    pin: list.pin,
    matchedCategory: category,
    placed: list.placed,
    online: list.online,
    removed: list.removed,
  });
});

type CreateBody = {
  name?: string;
  category?: BookmarkCategory;
  visibility?: Visibility;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  externalPlaceId?: string | null;
  isOnline?: boolean;
  onlineUrl?: string | null;
  /** Optional first note, written in the same step as the pin. */
  note?: string | null;
  /** Set once the resident has seen the near-duplicate warning and meant it. */
  confirmDuplicate?: boolean;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Pin a place.
 *
 * Any resident may do this — a map only one person is allowed to maintain stops
 * being maintained the week they get busy.
 *
 * Coordinates arrive from the client because they came from the autocomplete
 * proxy or a map long-press, and both of those already went through our own
 * server. They are persisted permanently at this moment and never looked up
 * again: geocoding on render would turn one popular page into a per-view
 * provider bill.
 */
export const POST = withUser(async (user, req: Request) => {
  const houseId = await requireActiveHouseId(user);

  const body = await readJson<CreateBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["name", "category"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  const name = String(body.name).trim();
  if (!name) return badRequest("Give the place a name.");
  if (name.length > MAX_NAME_LENGTH) {
    return badRequest(`Name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }

  const category = body.category as BookmarkCategory;
  if (!BOOKMARK_CATEGORIES.includes(category)) {
    return badRequest(`category must be one of: ${BOOKMARK_CATEGORIES.join(", ")}.`);
  }

  const visibility: Visibility = body.visibility === "PRIVATE" ? "PRIVATE" : "HOUSE";
  const isOnline = body.isOnline === true;

  const address = body.address?.toString().trim() || null;
  if (address && address.length > MAX_ADDRESS_LENGTH) {
    return badRequest(`Address must be ${MAX_ADDRESS_LENGTH} characters or fewer.`);
  }

  const onlineUrl = body.onlineUrl?.toString().trim() || null;
  if (onlineUrl && onlineUrl.length > MAX_URL_LENGTH) {
    return badRequest(`Link must be ${MAX_URL_LENGTH} characters or fewer.`);
  }
  if (onlineUrl && !/^https?:\/\//i.test(onlineUrl)) {
    return badRequest("Link must start with http:// or https://");
  }

  const note = body.note?.toString().trim() || null;
  if (note && note.length > MAX_NOTE_LENGTH) {
    return badRequest(`Note must be ${MAX_NOTE_LENGTH} characters or fewer.`);
  }

  // An online or delivery entry has no place on the map and never enters
  // distance ranking, so it is stored without coordinates even if some arrived.
  const lat = isOnline ? null : isFiniteNumber(body.lat) ? body.lat : null;
  const lng = isOnline ? null : isFiniteNumber(body.lng) ? body.lng : null;
  if ((lat === null) !== (lng === null)) {
    return badRequest("A location needs both a latitude and a longitude.");
  }
  if (lat !== null && (lat < -90 || lat > 90 || (lng as number) < -180 || (lng as number) > 180)) {
    return badRequest("Those coordinates are outside the range of the earth.");
  }

  const externalPlaceId = isOnline ? null : body.externalPlaceId?.toString().trim() || null;

  // Hard reject: the same provider place cannot be pinned twice in one house.
  // Checked here rather than left to the unique index so the response can name
  // the existing entry instead of returning "that already exists".
  if (externalPlaceId) {
    const existing = await prisma.bookmark.findFirst({
      where: { houseId, externalPlaceId },
      select: { id: true, name: true, deletedAt: true },
    });
    if (existing) {
      return badRequest(
        existing.deletedAt
          ? `"${existing.name}" was pinned before and then removed. Restore it instead of adding it again.`
          : `"${existing.name}" is already on your house map.`,
        { duplicateOf: existing.id, kind: "exact" }
      );
    }
  }

  // Soft warn: same category, within 50 m. Offers to append what was typed as a
  // note on the existing pin, which is nearly always what the resident meant —
  // a second row for the same shop splits the house's knowledge across two
  // cards and neither one is complete.
  if (lat !== null && lng !== null && !body.confirmDuplicate) {
    const nearby = await findNearbyDuplicates(houseId, category, { lat, lng: lng as number });
    if (nearby.length > 0) {
      return badRequest(
        `"${nearby[0].name}" is already pinned ${nearby[0].distanceMetres} m away in the same category. Add your note to it, or confirm you meant a separate place.`,
        { duplicateOf: nearby[0].id, duplicateName: nearby[0].name, kind: "nearby" }
      );
    }
  }

  const bookmark = await prisma.bookmark.create({
    data: {
      houseId,
      name,
      category,
      visibility,
      latitude: lat,
      longitude: lng,
      address,
      externalPlaceId,
      isOnline,
      onlineUrl: isOnline ? onlineUrl : null,
      addedById: user.id,
      // Snapshot, not a join. Attribution has to survive this resident leaving.
      addedByName: user.profile.name || user.email,
      ...(note
        ? {
            notes: {
              create: {
                body: note,
                authorId: user.id,
                authorName: user.profile.name || user.email,
              },
            },
          }
        : {}),
    },
    select: { id: true, name: true },
  });

  return ok({ bookmark }, 201);
});
