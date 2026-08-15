import "server-only";

import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { bookmarkVisibilityFilter, isHouseAdmin } from "@/lib/authz";
import {
  DUPLICATE_BBOX_DEGREES,
  LIVE_DEAL_STATUSES,
  NOTES_PREVIEW_COUNT,
  deriveDealStatus,
  freshness,
  haversineKm,
  isWithinDuplicateRadius,
  needsReconfirmation,
  type BookmarkView,
  type Coords,
  type DealView,
} from "@/lib/neighborhood";
import type { BookmarkCategory, Prisma } from "@prisma/client";

/**
 * Reads for M2.4, assembled server-side.
 *
 * Everything here takes a `houseId` that the CALLER derived from the session
 * (see requireActiveHouseId in lib/authz.ts). Nothing in this file accepts a
 * house id that came off the wire, and no exported function should ever be
 * changed to.
 */

/* ── The house origin point ─────────────────────────────────────────────── */

export type HousePin = {
  lat: number;
  lng: number;
  setAt: Date;
} | null;

/**
 * The point every distance is measured from, or null when the admin has not
 * placed it yet.
 *
 * Coordinates alone are not enough — a house can carry a lat/lng copied off a
 * listing that nobody has ever looked at. Until `mapPinSetAt` says a human
 * confirmed it, this returns null and the feature switches distance and routing
 * off rather than quietly ranking the whole map around the wrong building.
 *
 * Browser geolocation is deliberately not a fallback. It answers "where is this
 * phone", which on the bus home is not "where is the flat", and a distance list
 * that reorders itself as you walk is worse than one that says it needs setup.
 */
export async function getHousePin(houseId: string): Promise<HousePin> {
  const house = await prisma.house.findUnique({
    where: { id: houseId },
    select: { latitude: true, longitude: true, mapPinSetAt: true },
  });
  if (!house?.mapPinSetAt || house.latitude === null || house.longitude === null) return null;
  return { lat: house.latitude, lng: house.longitude, setAt: house.mapPinSetAt };
}

/** The suggested pin shown in setup before anyone confirms it. */
export async function getSuggestedPin(houseId: string): Promise<Coords | null> {
  const house = await prisma.house.findUnique({
    where: { id: houseId },
    select: { latitude: true, longitude: true },
  });
  if (!house || house.latitude === null || house.longitude === null) return null;
  return { lat: house.latitude, lng: house.longitude };
}

/* ── Counting ───────────────────────────────────────────────────────────── */

const BOOKMARK_SELECT = {
  id: true,
  name: true,
  category: true,
  visibility: true,
  latitude: true,
  longitude: true,
  address: true,
  isOnline: true,
  onlineUrl: true,
  externalPlaceId: true,
  addedById: true,
  addedByName: true,
  lastConfirmedAt: true,
  createdAt: true,
  deletedAt: true,
} satisfies Prisma.BookmarkSelect;

type BookmarkRow = Prisma.BookmarkGetPayload<{ select: typeof BOOKMARK_SELECT }>;

/**
 * Distinct residents who said each place is still there, EXCLUDING whoever
 * pinned it.
 *
 * Self-verification would make the count meaningless: anyone could add a shop
 * that does not exist and stamp it "confirmed by 1 resident" in the same
 * minute. The exclusion is applied here rather than in SQL because it is
 * per-row — each bookmark excludes a different person.
 */
async function confirmCounts(bookmarks: BookmarkRow[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (bookmarks.length === 0) return counts;

  const authorOf = new Map(bookmarks.map((b) => [b.id, b.addedById]));

  const rows = await prisma.confirmation.findMany({
    where: { bookmarkId: { in: bookmarks.map((b) => b.id) }, verdict: "STILL_THERE" },
    select: { bookmarkId: true, residentId: true },
    distinct: ["bookmarkId", "residentId"],
  });

  for (const row of rows) {
    if (authorOf.get(row.bookmarkId) === row.residentId) continue;
    counts.set(row.bookmarkId, (counts.get(row.bookmarkId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Live deals per bookmark.
 *
 * Counted by deriving each deal's status from its timestamps, not by trusting
 * `cached_status`. A badge saying "2 deals" over a pin whose offers both lapsed
 * last week is the exact failure the read-time derivation exists to prevent.
 */
async function activeDealCounts(bookmarkIds: string[], now: Date): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (bookmarkIds.length === 0) return counts;

  const deals = await prisma.deal.findMany({
    where: { bookmarkId: { in: bookmarkIds }, deletedAt: null },
    select: {
      bookmarkId: true,
      validFrom: true,
      validUntil: true,
      lastConfirmedAt: true,
      retiredAt: true,
      createdAt: true,
    },
  });

  for (const deal of deals) {
    if (!LIVE_DEAL_STATUSES.includes(deriveDealStatus(deal, now))) continue;
    counts.set(deal.bookmarkId, (counts.get(deal.bookmarkId) ?? 0) + 1);
  }
  return counts;
}

async function notesFor(
  bookmarkIds: string[]
): Promise<{ preview: Map<string, BookmarkView["notes"]>; total: Map<string, number> }> {
  const preview = new Map<string, BookmarkView["notes"]>();
  const total = new Map<string, number>();
  if (bookmarkIds.length === 0) return { preview, total };

  const rows = await prisma.bookmarkNote.findMany({
    where: { bookmarkId: { in: bookmarkIds }, deletedAt: null },
    select: {
      id: true,
      bookmarkId: true,
      body: true,
      authorId: true,
      authorName: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  for (const row of rows) {
    total.set(row.bookmarkId, (total.get(row.bookmarkId) ?? 0) + 1);
    const list = preview.get(row.bookmarkId) ?? [];
    if (list.length < NOTES_PREVIEW_COUNT) {
      list.push({
        id: row.id,
        body: row.body,
        authorId: row.authorId,
        authorName: row.authorName,
        createdAt: row.createdAt.toISOString(),
      });
      preview.set(row.bookmarkId, list);
    }
  }
  return { preview, total };
}

/* ── Assembling the view ────────────────────────────────────────────────── */

export type ListOptions = {
  category?: BookmarkCategory | null;
  /** Free-text need; matched against name and notes with trigram similarity. */
  query?: string | null;
  includeDeleted?: boolean;
  /** Only entries that can be drawn on a map. */
  mappableOnly?: boolean;
};

export type BookmarkList = {
  pin: HousePin;
  /** Ranked by distance when the pin is set; alphabetical when it isn't. */
  placed: BookmarkView[];
  /** Online and delivery entries, unranked, shown as their own group. */
  online: BookmarkView[];
  /** Soft-deleted entries still inside their restore window. */
  removed: BookmarkView[];
};

/**
 * The need finder's answer, and the data behind every other view.
 *
 * Ranking is by haversine distance from the house pin and costs zero API calls.
 * Online and delivery bookmarks are pulled out into their own group rather than
 * sorted to the bottom: "5 km away" is a fact about a shop, and printing it
 * next to something that delivers to the door would be a lie of arrangement.
 */
export async function listBookmarks(
  user: SessionUser,
  houseId: string,
  options: ListOptions = {}
): Promise<BookmarkList> {
  const now = new Date();
  const [pin, canManage] = await Promise.all([getHousePin(houseId), isHouseAdmin(user.id, houseId)]);

  const where: Prisma.BookmarkWhereInput = {
    ...bookmarkVisibilityFilter(user, houseId),
    ...(options.category ? { category: options.category } : {}),
    ...(options.mappableOnly ? { isOnline: false, latitude: { not: null } } : {}),
  };

  const rows = await prisma.bookmark.findMany({
    where: options.includeDeleted ? where : { ...where, deletedAt: null },
    select: BOOKMARK_SELECT,
    orderBy: { name: "asc" },
  });

  const ids = rows.map((row) => row.id);
  const [counts, deals, notes] = await Promise.all([
    confirmCounts(rows),
    activeDealCounts(ids, now),
    notesFor(ids),
  ]);

  const views = rows.map((row): BookmarkView => {
    const distanceKm =
      pin && !row.isOnline && row.latitude !== null && row.longitude !== null
        ? haversineKm(pin, { lat: row.latitude, lng: row.longitude })
        : null;

    return {
      id: row.id,
      name: row.name,
      category: row.category,
      visibility: row.visibility,
      lat: row.latitude,
      lng: row.longitude,
      address: row.address,
      isOnline: row.isOnline,
      onlineUrl: row.onlineUrl,
      externalPlaceId: row.externalPlaceId,
      addedByName: row.addedByName,
      addedById: row.addedById,
      createdAt: row.createdAt.toISOString(),
      deletedAt: row.deletedAt?.toISOString() ?? null,
      lastConfirmedAt: row.lastConfirmedAt?.toISOString() ?? null,
      freshness: freshness(
        {
          lastConfirmedAt: row.lastConfirmedAt,
          createdAt: row.createdAt,
          confirmCount: counts.get(row.id) ?? 0,
        },
        now
      ),
      notes: notes.preview.get(row.id) ?? [],
      noteCount: notes.total.get(row.id) ?? 0,
      activeDealCount: deals.get(row.id) ?? 0,
      distanceKm,
      canEdit: canManage || row.addedById === user.id,
    };
  });

  const live = views.filter((view) => view.deletedAt === null);

  const placed = live
    .filter((view) => !view.isOnline)
    .sort((a, b) => {
      // Entries with no coordinates cannot be ranked, so they fall to the
      // bottom of the ranked group rather than pretending to be nearest.
      if (a.distanceKm === null && b.distanceKm === null) return a.name.localeCompare(b.name);
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });

  return {
    pin,
    placed,
    online: live.filter((view) => view.isOnline),
    removed: views.filter((view) => view.deletedAt !== null),
  };
}

/* ── Deals ──────────────────────────────────────────────────────────────── */

export type DealListOptions = {
  bookmarkId?: string;
  /** Include EXPIRED and RETIRED entries; ARCHIVED always needs this too. */
  includeArchived?: boolean;
};

/**
 * Deals across the house, soonest expiry first.
 *
 * The SQL filter is deliberately loose — it excludes only soft-deleted rows and
 * (when the archive is not wanted) rows the nightly job has already marked
 * ARCHIVED. The status a resident actually sees is derived here, from
 * timestamps, so a cron job that has not run since Tuesday cannot put a lapsed
 * offer on the feed.
 */
export async function listDeals(
  user: SessionUser,
  houseId: string,
  options: DealListOptions = {}
): Promise<DealView[]> {
  const now = new Date();

  const rows = await prisma.deal.findMany({
    where: {
      deletedAt: null,
      ...(options.bookmarkId ? { bookmarkId: options.bookmarkId } : {}),
      // Scoping through the bookmark is what keeps one house's offers out of
      // another's feed, and a resident's PRIVATE pins out of everyone else's.
      bookmark: { ...bookmarkVisibilityFilter(user, houseId), deletedAt: null },
    },
    select: {
      id: true,
      bookmarkId: true,
      title: true,
      description: true,
      discountNote: true,
      validFrom: true,
      validUntil: true,
      lastConfirmedAt: true,
      retiredAt: true,
      createdAt: true,
      postedById: true,
      postedByName: true,
      bookmark: { select: { name: true } },
    },
  });

  const views = rows.map((row): DealView => ({
    id: row.id,
    bookmarkId: row.bookmarkId,
    bookmarkName: row.bookmark.name,
    title: row.title,
    description: row.description,
    discountNote: row.discountNote,
    validFrom: row.validFrom.toISOString(),
    validUntil: row.validUntil?.toISOString() ?? null,
    status: deriveDealStatus(row, now),
    needsReconfirmation: needsReconfirmation(row, now),
    postedByName: row.postedByName,
    postedById: row.postedById,
    lastConfirmedAt: row.lastConfirmedAt?.toISOString() ?? null,
  }));

  const visible = options.includeArchived
    ? views
    : views.filter((view) => view.status !== "ARCHIVED");

  // Soonest expiry first, because that is the order in which they stop being
  // useful. Open-ended offers have no deadline to sort by and sit after the
  // ones that do.
  return visible.sort((a, b) => {
    const rank = (status: DealView["status"]) =>
      status === "EXPIRING_SOON" ? 0 : status === "ACTIVE" ? 1 : 2;
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    if (a.validUntil && b.validUntil) return a.validUntil.localeCompare(b.validUntil);
    if (a.validUntil) return -1;
    if (b.validUntil) return 1;
    return a.bookmarkName.localeCompare(b.bookmarkName);
  });
}

/* ── Deduplication ──────────────────────────────────────────────────────── */

export type DuplicateCandidate = {
  id: string;
  name: string;
  distanceMetres: number;
};

/**
 * Places in the same category close enough to be the one being added.
 *
 * Two-stage on purpose. Postgres narrows by a bounding box on plain float
 * columns — an index-friendly comparison needing no extension — and the exact
 * great-circle check then runs in application code over the handful of rows
 * that survive. A correct radius query in SQL would mean installing PostGIS for
 * one warning message.
 */
export async function findNearbyDuplicates(
  houseId: string,
  category: BookmarkCategory,
  coords: Coords,
  excludeBookmarkId?: string
): Promise<DuplicateCandidate[]> {
  const candidates = await prisma.bookmark.findMany({
    where: {
      houseId,
      category,
      deletedAt: null,
      isOnline: false,
      ...(excludeBookmarkId ? { id: { not: excludeBookmarkId } } : {}),
      latitude: { gte: coords.lat - DUPLICATE_BBOX_DEGREES, lte: coords.lat + DUPLICATE_BBOX_DEGREES },
      longitude: { gte: coords.lng - DUPLICATE_BBOX_DEGREES, lte: coords.lng + DUPLICATE_BBOX_DEGREES },
    },
    select: { id: true, name: true, latitude: true, longitude: true },
  });

  return candidates
    .filter((row) => row.latitude !== null && row.longitude !== null)
    .map((row) => ({
      id: row.id,
      name: row.name,
      point: { lat: row.latitude as number, lng: row.longitude as number },
    }))
    .filter((row) => isWithinDuplicateRadius(coords, row.point))
    .map((row) => ({
      id: row.id,
      name: row.name,
      distanceMetres: Math.round(haversineKm(coords, row.point) * 1000),
    }));
}

/* ── Soft deletion ──────────────────────────────────────────────────────── */

/**
 * Removes a place and its offers together, without deleting a row.
 *
 * A deal whose shop has gone is not an offer any more, but it is not retired
 * either — nobody pulled it — so it gets its own `deleted_at` rather than
 * borrowing `retired_at`. Keeping the two apart is what lets a restore inside
 * the 30-day window bring the offers back in the state they were in.
 */
export async function softDeleteBookmark(bookmarkId: string, at: Date = new Date()) {
  return prisma.$transaction([
    prisma.bookmark.update({ where: { id: bookmarkId }, data: { deletedAt: at } }),
    prisma.deal.updateMany({
      where: { bookmarkId, deletedAt: null },
      data: { deletedAt: at },
    }),
  ]);
}

export async function restoreBookmark(bookmarkId: string) {
  return prisma.$transaction([
    prisma.bookmark.update({ where: { id: bookmarkId }, data: { deletedAt: null } }),
    prisma.deal.updateMany({ where: { bookmarkId }, data: { deletedAt: null } }),
  ]);
}

/** Active residents of the house — the denominator for the GONE threshold. */
export async function activeResidentCount(houseId: string): Promise<number> {
  return prisma.houseMember.count({ where: { houseId, status: "ACTIVE" } });
}
