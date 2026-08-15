import { badRequest, notFound, ok, readJson, withUser } from "@/lib/api";
import {
  assertCanEditBookmark,
  assertCanRestoreBookmark,
  bookmarkVisibilityFilter,
  loadVisibleBookmark,
  requireActiveHouseId,
} from "@/lib/authz";
import {
  BOOKMARK_CATEGORIES,
  MAX_ADDRESS_LENGTH,
  MAX_NAME_LENGTH,
  MAX_URL_LENGTH,
  RESTORE_WINDOW_DAYS,
  daysBetween,
  freshness,
  haversineKm,
} from "@/lib/neighborhood";
import {
  getHousePin,
  listDeals,
  restoreBookmark,
  softDeleteBookmark,
} from "@/lib/neighborhood.server";
import { prisma } from "@/lib/prisma";
import type { BookmarkCategory, Visibility } from "@prisma/client";

type Params = { params: { id: string } };

/** M2.4 Shared House Map — one place, with its notes, history and deals. */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, _req: Request, { params }: Params) => {
  const houseId = await requireActiveHouseId(user);

  const bookmark = await prisma.bookmark.findFirst({
    where: { id: params.id, ...bookmarkVisibilityFilter(user, houseId) },
    include: {
      notes: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      confirmations: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { resident: { select: { name: true } } },
      },
    },
  });
  if (!bookmark) return notFound("No such bookmark");

  const [pin, deals] = await Promise.all([
    getHousePin(houseId),
    listDeals(user, houseId, { bookmarkId: bookmark.id, includeArchived: true }),
  ]);

  // Distinct residents who vouched for it, minus whoever pinned it — the same
  // rule the list view applies, because a detail page that disagreed with the
  // card it was opened from would just look broken.
  const vouchers = new Set(
    bookmark.confirmations
      .filter((row) => row.verdict === "STILL_THERE" && row.residentId !== bookmark.addedById)
      .map((row) => row.residentId)
  );

  return ok({
    bookmark: {
      id: bookmark.id,
      name: bookmark.name,
      category: bookmark.category,
      visibility: bookmark.visibility,
      lat: bookmark.latitude,
      lng: bookmark.longitude,
      address: bookmark.address,
      isOnline: bookmark.isOnline,
      onlineUrl: bookmark.onlineUrl,
      addedByName: bookmark.addedByName,
      addedById: bookmark.addedById,
      createdAt: bookmark.createdAt.toISOString(),
      deletedAt: bookmark.deletedAt?.toISOString() ?? null,
      lastConfirmedAt: bookmark.lastConfirmedAt?.toISOString() ?? null,
      freshness: freshness(
        {
          lastConfirmedAt: bookmark.lastConfirmedAt,
          createdAt: bookmark.createdAt,
          confirmCount: vouchers.size,
        },
        new Date()
      ),
      distanceKm:
        pin && !bookmark.isOnline && bookmark.latitude !== null && bookmark.longitude !== null
          ? haversineKm(pin, { lat: bookmark.latitude, lng: bookmark.longitude })
          : null,
    },
    notes: bookmark.notes.map((note) => ({
      id: note.id,
      body: note.body,
      authorId: note.authorId,
      authorName: note.authorName,
      createdAt: note.createdAt.toISOString(),
    })),
    confirmations: bookmark.confirmations.map((row) => ({
      id: row.id,
      verdict: row.verdict,
      residentName: row.resident.name,
      createdAt: row.createdAt.toISOString(),
    })),
    deals,
    pin,
  });
});

type PatchBody = {
  name?: string;
  category?: BookmarkCategory;
  visibility?: Visibility;
  address?: string | null;
  onlineUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Bring a soft-deleted place back inside its 30-day window. */
  restore?: boolean;
};

export const PATCH = withUser(async (user, req: Request, { params }: Params) => {
  const body = await readJson<PatchBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  if (body.restore === true) {
    const existing = await assertCanRestoreBookmark(user, params.id);
    if (!existing.deletedAt) return badRequest("That place hasn't been removed.");

    // After the window the entry is gone for good as far as the UI is
    // concerned, and quietly resurrecting a year-old pin nobody remembers
    // reporting would be worse than refusing.
    if (daysBetween(existing.deletedAt, new Date()) > RESTORE_WINDOW_DAYS) {
      return badRequest(
        `The ${RESTORE_WINDOW_DAYS}-day window to restore this place has passed. Add it again if it's back.`
      );
    }

    await restoreBookmark(params.id);
    return ok({ restored: true });
  }

  await assertCanEditBookmark(user, params.id);

  // Whitelist. Never spread the body — houseId and addedById are exactly the
  // two fields a caller would most like to overwrite.
  const data: {
    name?: string;
    category?: BookmarkCategory;
    visibility?: Visibility;
    address?: string | null;
    onlineUrl?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return badRequest("Give the place a name.");
    if (name.length > MAX_NAME_LENGTH) {
      return badRequest(`Name must be ${MAX_NAME_LENGTH} characters or fewer.`);
    }
    data.name = name;
  }

  if (body.category !== undefined) {
    if (!BOOKMARK_CATEGORIES.includes(body.category)) {
      return badRequest(`category must be one of: ${BOOKMARK_CATEGORIES.join(", ")}.`);
    }
    data.category = body.category;
  }

  if (body.visibility !== undefined) {
    if (body.visibility !== "HOUSE" && body.visibility !== "PRIVATE") {
      return badRequest("visibility must be HOUSE or PRIVATE.");
    }
    data.visibility = body.visibility;
  }

  if (body.address !== undefined) {
    const address = body.address?.toString().trim() || null;
    if (address && address.length > MAX_ADDRESS_LENGTH) {
      return badRequest(`Address must be ${MAX_ADDRESS_LENGTH} characters or fewer.`);
    }
    data.address = address;
  }

  if (body.onlineUrl !== undefined) {
    const url = body.onlineUrl?.toString().trim() || null;
    if (url && url.length > MAX_URL_LENGTH) {
      return badRequest(`Link must be ${MAX_URL_LENGTH} characters or fewer.`);
    }
    if (url && !/^https?:\/\//i.test(url)) {
      return badRequest("Link must start with http:// or https://");
    }
    data.onlineUrl = url;
  }

  // Moving a pin is allowed — the first drop is often a few doors off — but
  // both halves have to move together or the row stops being a location.
  if (body.lat !== undefined || body.lng !== undefined) {
    const lat = typeof body.lat === "number" && Number.isFinite(body.lat) ? body.lat : null;
    const lng = typeof body.lng === "number" && Number.isFinite(body.lng) ? body.lng : null;
    if ((lat === null) !== (lng === null)) {
      return badRequest("A location needs both a latitude and a longitude.");
    }
    if (lat !== null && (lat < -90 || lat > 90 || (lng as number) < -180 || (lng as number) > 180)) {
      return badRequest("Those coordinates are outside the range of the earth.");
    }
    data.latitude = lat;
    data.longitude = lng;
  }

  if (Object.keys(data).length === 0) return badRequest("Nothing to update.");

  const bookmark = await prisma.bookmark.update({
    where: { id: params.id },
    data,
    select: { id: true, name: true },
  });

  return ok({ bookmark });
});

/**
 * Remove a place.
 *
 * Soft delete, always, and the deals go with it in the same transaction. A hard
 * delete would take every note the household wrote on it — years of "ask for
 * Rafiq, he gives the good rate" — and there is no way back from that.
 */
export const DELETE = withUser(async (user, _req: Request, { params }: Params) => {
  const existing = await assertCanEditBookmark(user, params.id);
  if (existing.deletedAt) return badRequest("That place has already been removed.");

  await softDeleteBookmark(params.id);
  return ok({ deleted: true, restorableForDays: RESTORE_WINDOW_DAYS });
});

/** Kept so a caller that guesses at the shape gets a clear error, not a 405
 * that looks like the route is missing. */
export const PUT = withUser(async (user, _req: Request, { params }: Params) => {
  await loadVisibleBookmark(user, params.id);
  return badRequest("Use PATCH to edit a bookmark.");
});
