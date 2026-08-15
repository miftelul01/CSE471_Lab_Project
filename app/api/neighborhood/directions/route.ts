import { badRequest, notFound, ok, readJson, withUser } from "@/lib/api";
import { bookmarkVisibilityFilter, requireActiveHouseId } from "@/lib/authz";
import { fetchRoute } from "@/lib/mapProviders";
import {
  ROUTE_PROFILES,
  formatRoadDistance,
  formatStraightLine,
  haversineKm,
  type RouteProfile,
} from "@/lib/neighborhood";
import { getHousePin } from "@/lib/neighborhood.server";
import { prisma } from "@/lib/prisma";

/**
 * M2.4 — road directions to ONE place, on explicit request.
 *
 * This is the only endpoint in the feature that can spend routing quota, and it
 * spends it for exactly one destination per call, only when a resident pressed
 * "Get directions". Nothing precomputes routes for a list of pins: forty
 * bookmarks would be forty requests to render a page nobody asked to route.
 *
 * The destination is looked up by id and its coordinates read from OUR row
 * rather than taken from the request. A client that could post arbitrary
 * coordinates here would have a free, authenticated routing proxy.
 */

export const dynamic = "force-dynamic";

export const POST = withUser(async (user, req: Request) => {
  const houseId = await requireActiveHouseId(user);

  const pin = await getHousePin(houseId);
  if (!pin) {
    return badRequest("Set your house map pin before asking for directions.");
  }

  const body = await readJson<{ bookmarkId?: string; profile?: RouteProfile }>(req);
  if (!body?.bookmarkId) return badRequest("Which place? Send bookmarkId.");

  const profile = body.profile ?? "foot-walking";
  if (!ROUTE_PROFILES.includes(profile)) {
    return badRequest(`profile must be one of: ${ROUTE_PROFILES.join(", ")}.`);
  }

  const bookmark = await prisma.bookmark.findFirst({
    where: { id: body.bookmarkId, ...bookmarkVisibilityFilter(user, houseId), deletedAt: null },
    select: { id: true, name: true, latitude: true, longitude: true, isOnline: true },
  });
  if (!bookmark) return notFound("No such bookmark");

  if (bookmark.isOnline || bookmark.latitude === null || bookmark.longitude === null) {
    return badRequest("That entry has no location to navigate to.");
  }

  const destination = { lat: bookmark.latitude, lng: bookmark.longitude };
  const straightKm = haversineKm(pin, destination);

  try {
    const { route, cached } = await fetchRoute(user.id, pin, destination, profile);
    return ok({
      profile,
      cached,
      distanceMetres: route.distanceMetres,
      durationSeconds: route.durationSeconds,
      geometry: route.geometry,
      label: formatRoadDistance(route.distanceMetres, route.durationSeconds),
      approximate: false,
    });
  } catch (error) {
    // Never block the UI on a routing call. A provider being down, out of
    // quota, or simply unable to find a path through an unmapped alley is not a
    // reason to show the resident nothing — the straight-line figure we already
    // have is useful as long as it is labelled as the guess it is.
    console.warn("[m2.4] routing fell back to haversine:", error);
    return ok({
      profile,
      cached: false,
      distanceMetres: Math.round(straightKm * 1000),
      durationSeconds: null,
      geometry: null,
      label: formatStraightLine(straightKm),
      approximate: true,
      reason: error instanceof Error ? error.message : "Routing is unavailable right now.",
    });
  }
});
