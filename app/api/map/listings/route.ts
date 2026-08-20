import { badRequest, ok, withUser } from "@/lib/api";
import { bulkCanSeeExactListingLocation, listingVisibilityFilter } from "@/lib/authz";
import { commuteFor, formatCommuteMinutes, fuzzCoordinates, type CommuteFigure } from "@/lib/mapListings";
import { hasRoutingProvider } from "@/lib/mapProviders";
import { ROUTE_PROFILES, type Coords, type RouteProfile } from "@/lib/neighborhood";
import { prisma } from "@/lib/prisma";

/**
 * M3.3 — Listings Map & Commute Evaluation (Mahia Tanzin).
 *
 * Property discovery for prospective tenants. Every listing's PUBLIC pin is
 * fuzzed (lib/mapListings.ts fuzzCoordinates) — the exact coordinates and
 * full address only unlock per-listing via bulkCanSeeExactListingLocation
 * (landlord, platform admin, or an active PENDING/ACCEPTED join request).
 *
 * Commute is computed against the SAME fuzzed point unless that check
 * passes — never against the true coordinates for an unauthorized viewer.
 * An earlier version of this route computed commute against the true point
 * unconditionally on the theory that "an accurate travel time doesn't
 * reveal a precise pin." That's false: a few queries from different origins
 * trilaterate the exact point from precise commute distances. Don't
 * reintroduce it.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: Request) => {
  const params = new URL(req.url).searchParams;

  const originLatRaw = params.get("originLat");
  const originLngRaw = params.get("originLng");
  const mode = (params.get("mode") as RouteProfile | null) ?? "driving-car";
  if (!ROUTE_PROFILES.includes(mode)) {
    return badRequest(`mode must be one of: ${ROUTE_PROFILES.join(", ")}`);
  }

  let origin: Coords | null = null;
  if (originLatRaw != null && originLngRaw != null) {
    const lat = Number(originLatRaw);
    const lng = Number(originLngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return badRequest("originLat/originLng must be valid coordinates.");
    }
    origin = { lat, lng };
  }

  const listings = await prisma.listing.findMany({
    where: listingVisibilityFilter(user),
    select: {
      id: true,
      title: true,
      rent: true,
      roomType: true,
      capacity: true,
      area: true,
      landlordId: true,
      latitude: true,
      longitude: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Bulk-resolve "exact location unlocked" once instead of per listing.
  const unlocked = await bulkCanSeeExactListingLocation(user, listings);

  const results = await Promise.all(
    listings.map(async (l) => {
      const hasCoords = l.latitude != null && l.longitude != null;
      const exact = unlocked.has(l.id);

      const approx = hasCoords ? fuzzCoordinates(l.latitude!, l.longitude!, l.id) : null;

      // Commute is computed against whatever point the viewer is actually
      // allowed to see — the true coordinates only when unlocked, the same
      // fuzzed point otherwise. Computing it against the true point for an
      // unauthorized viewer would leak the exact location back out through
      // the distance figure regardless of what the pin itself shows.
      let commute: CommuteFigure | null = null;
      if (origin && hasCoords) {
        const destination = exact ? { lat: l.latitude!, lng: l.longitude! } : approx!;
        commute = await commuteFor(user.id, origin, destination, mode);
      }

      return {
        id: l.id,
        title: l.title,
        rent: Number(l.rent),
        roomType: l.roomType,
        capacity: l.capacity,
        area: l.area,
        approxLat: approx?.lat ?? null,
        approxLng: approx?.lng ?? null,
        exactLat: exact && hasCoords ? l.latitude : null,
        exactLng: exact && hasCoords ? l.longitude : null,
        locationUnlocked: exact,
        commuteMinutes: commute ? formatCommuteMinutes(commute.durationSeconds) : null,
        commuteDistanceMetres: commute?.distanceMetres ?? null,
        commuteEstimated: commute?.estimated ?? null,
      };
    })
  );

  return ok({ listings: results, routingProviderConfigured: hasRoutingProvider() });
});
