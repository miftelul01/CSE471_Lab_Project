import { enforceRateLimit, fetchRoute, hasRoutingProvider } from "@/lib/mapProviders";
import { haversineKm, type Coords, type RouteProfile } from "@/lib/neighborhood";
import { prisma } from "@/lib/prisma";

/**
 * M3.3 — Listings Map & Commute Evaluation (Mahia Tanzin).
 *
 * Property discovery for people who do NOT live here yet — plots the
 * `listings` table on a map with a commute-distance helper. Distinct from
 * M2.4's neighborhood knowledge base (private, for current residents): this
 * reads only `Listing`, never M2.4's tables.
 *
 * Reuses the same free/keyless provider stack M2.4 already built
 * (lib/mapProviders.ts, lib/neighborhood.ts) rather than a parallel Google
 * Maps integration — no API key is configured for either.
 */

/* ── Privacy: approximate public pin vs. exact ────────────────────────────── */

/**
 * Deterministic ~100-150m jitter, seeded from the listing id so the SAME
 * listing always fuzzes to the SAME point (a randomly-jittering pin on every
 * request would look broken, not private). This is what every stranger sees;
 * the real coordinates are gated behind canSeeExactListingLocation.
 */
export function fuzzCoordinates(lat: number, lng: number, listingId: string): Coords {
  let hash = 0;
  for (let i = 0; i < listingId.length; i++) {
    hash = (hash * 31 + listingId.charCodeAt(i)) | 0;
  }
  // Two independent pseudo-random unit values from the same hash, spread
  // 0-360 degrees apart so the offset direction varies listing to listing.
  const angle = (hash % 360) * (Math.PI / 180);
  const radiusDegrees = 0.0009 + (Math.abs(hash >> 8) % 5) * 0.0002; // ~100-150m
  return {
    lat: lat + radiusDegrees * Math.cos(angle),
    lng: lng + radiusDegrees * Math.sin(angle),
  };
}

/* ── Commute ───────────────────────────────────────────────────────────── */

/** Skip the routing API for anything obviously too far — a cheap, free pre-filter. */
export const COMMUTE_PREFILTER_KM = 30;

export function formatCommuteMinutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

export type CommuteFigure = { distanceMetres: number; durationSeconds: number; estimated: boolean };

/**
 * Commute distance/time from `origin` to `destination`.
 *
 * IMPORTANT: the caller decides what `destination` is. Passing a listing's
 * TRUE coordinates here for a viewer who is not authorized to see them
 * defeats fuzzCoordinates entirely — a handful of queries from different
 * origins is enough to trilaterate the real point from precise commute
 * distances. Callers must pass the fuzzed point unless the viewer has
 * already unlocked the exact one (see canSeeExactListingLocation /
 * bulkCanSeeExactListingLocation in lib/authz.ts).
 *
 * Reuses M2.4's fetchRoute() when a routing key is configured; degrades to a
 * clearly-flagged straight-line estimate when it isn't (none is configured
 * today), rather than a silent blank. Metered under its own "commute" bucket
 * (separate from M2.4's "directions") in both branches, so this is never
 * free to hammer — a single listing's routing failure, including being over
 * budget, returns null instead of throwing, so it never takes down a whole
 * page of results.
 */
export async function commuteFor(
  userId: string,
  origin: Coords,
  destination: Coords,
  mode: RouteProfile
): Promise<CommuteFigure | null> {
  const straightLineKm = haversineKm(origin, destination);
  if (straightLineKm > COMMUTE_PREFILTER_KM) return null;

  if (!hasRoutingProvider()) {
    try {
      await enforceRateLimit(userId, "commute");
    } catch {
      return null;
    }
    const speedKmh = mode === "foot-walking" ? 4.5 : 22;
    return {
      distanceMetres: Math.round(straightLineKm * 1000),
      durationSeconds: Math.round((straightLineKm / speedKmh) * 3600),
      estimated: true,
    };
  }

  try {
    const { route } = await fetchRoute(userId, origin, destination, mode, "commute");
    return { distanceMetres: route.distanceMetres, durationSeconds: route.durationSeconds, estimated: false };
  } catch {
    return null;
  }
}

/* ── Saved commute searches ───────────────────────────────────────────────── */

export const MAX_LABEL_LENGTH = 60;
export const MIN_COMMUTE_MINUTES = 1;
export const MAX_COMMUTE_MINUTES = 180;

export type SavedSearchInput = {
  label: string;
  originAddress: string;
  originLat: number;
  originLng: number;
  maxCommuteMinutes: number;
  mode: RouteProfile;
};

export function validateSavedSearchInput(input: unknown): string | null {
  if (typeof input !== "object" || input === null) return "Invalid saved search.";
  const { label, originAddress, originLat, originLng, maxCommuteMinutes, mode } =
    input as Partial<SavedSearchInput>;

  if (!label || !label.trim()) return "A saved search needs a label.";
  if (label.trim().length > MAX_LABEL_LENGTH) return `Label must be ${MAX_LABEL_LENGTH} characters or fewer.`;
  if (!originAddress || !originAddress.trim()) return "An origin address is required.";
  if (typeof originLat !== "number" || originLat < -90 || originLat > 90) {
    return "originLat must be a valid latitude.";
  }
  if (typeof originLng !== "number" || originLng < -180 || originLng > 180) {
    return "originLng must be a valid longitude.";
  }
  if (
    typeof maxCommuteMinutes !== "number" ||
    !Number.isInteger(maxCommuteMinutes) ||
    maxCommuteMinutes < MIN_COMMUTE_MINUTES ||
    maxCommuteMinutes > MAX_COMMUTE_MINUTES
  ) {
    return `maxCommuteMinutes must be a whole number from ${MIN_COMMUTE_MINUTES} to ${MAX_COMMUTE_MINUTES}.`;
  }
  if (mode !== "driving-car" && mode !== "foot-walking") {
    return "mode must be driving-car or foot-walking.";
  }
  return null;
}

/**
 * Same per-mode speeds commuteFor()'s straight-line estimate uses, padded
 * ~30% for the fact that real roads/paths are never perfectly straight. Used
 * only as a cheap pre-filter radius below, never shown to a user directly.
 */
const MODE_PREFILTER_KMH: Record<RouteProfile, number> = {
  "foot-walking": 4.5 * 1.3,
  "driving-car": 22 * 1.3,
};

/**
 * Listings created after `lastViewedAt` that fall within both the
 * straight-line pre-filter and the saved commute budget — the "new matches"
 * a saved search surfaces, computed live rather than pushed (no notification
 * system exists anywhere in this app; same lazy-evaluation pattern as
 * lib/joinRequests.ts and lib/menu.ts).
 *
 * The radius must vary by mode: a flat distance-per-minute figure that's
 * reasonable for driving is roughly 6x too generous for walking, which would
 * surface listings hours away on foot as "new matches" for a walking search.
 */
export async function findNewMatchesForSearch(
  search: {
    originLat: number;
    originLng: number;
    maxCommuteMinutes: number;
    mode: RouteProfile;
    lastViewedAt: Date;
  }
): Promise<{ id: string; title: string; rent: number }[]> {
  const speedKmh = MODE_PREFILTER_KMH[search.mode] ?? MODE_PREFILTER_KMH["driving-car"];
  const radiusKm = (search.maxCommuteMinutes / 60) * speedKmh;
  const listings = await prisma.listing.findMany({
    where: {
      isActive: true,
      status: "PUBLISHED",
      createdAt: { gt: search.lastViewedAt },
      latitude: { not: null },
      longitude: { not: null },
    },
    select: { id: true, title: true, rent: true, latitude: true, longitude: true },
  });

  const origin: Coords = { lat: search.originLat, lng: search.originLng };
  return listings
    .filter((l) => haversineKm(origin, { lat: l.latitude!, lng: l.longitude! }) <= radiusKm)
    .map((l) => ({ id: l.id, title: l.title, rent: Number(l.rent) }));
}
