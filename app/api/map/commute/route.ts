import { badRequest, ok, withUser } from "@/lib/api";
import { bulkCanSeeExactListingLocation, listingVisibilityFilter } from "@/lib/authz";
import { commuteFor, formatCommuteMinutes, fuzzCoordinates } from "@/lib/mapListings";
import { hasRoutingProvider } from "@/lib/mapProviders";
import { ROUTE_PROFILES, type Coords, type RouteProfile } from "@/lib/neighborhood";
import { prisma } from "@/lib/prisma";

/**
 * M3.3 — batch commute for the multi-origin comparison view: the client
 * calls this once per saved origin (e.g. "Home" and "University") and shows
 * both figures side by side per listing.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: Request) => {
  const params = new URL(req.url).searchParams;

  const lat = Number(params.get("originLat"));
  const lng = Number(params.get("originLng"));
  const mode = (params.get("mode") as RouteProfile | null) ?? "driving-car";
  const listingIds = (params.get("listingIds") ?? "").split(",").filter(Boolean);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return badRequest("originLat/originLng must be valid coordinates.");
  }
  if (!ROUTE_PROFILES.includes(mode)) {
    return badRequest(`mode must be one of: ${ROUTE_PROFILES.join(", ")}`);
  }
  if (listingIds.length === 0) return badRequest("listingIds is required (comma-separated).");
  if (listingIds.length > 50) return badRequest("Ask for at most 50 listings at a time.");

  const origin: Coords = { lat, lng };

  // Reuses the same visibility filter as the discovery map — a caller can't
  // probe delisted/hidden listing ids for a commute figure any more than
  // they could browse them.
  const listings = await prisma.listing.findMany({
    where: { id: { in: listingIds }, ...listingVisibilityFilter(user) },
    select: { id: true, latitude: true, longitude: true, landlordId: true },
  });

  const unlocked = await bulkCanSeeExactListingLocation(user, listings);

  const results = await Promise.all(
    listings
      .filter((l) => l.latitude != null && l.longitude != null)
      .map(async (l) => {
        // Same rule as /api/map/listings: never compute against the true
        // coordinates for a viewer who hasn't unlocked them, or the distance
        // figure leaks the exact location the pin itself is hiding.
        const destination = unlocked.has(l.id)
          ? { lat: l.latitude!, lng: l.longitude! }
          : fuzzCoordinates(l.latitude!, l.longitude!, l.id);
        const commute = await commuteFor(user.id, origin, destination, mode);
        return {
          listingId: l.id,
          commuteMinutes: commute ? formatCommuteMinutes(commute.durationSeconds) : null,
          commuteDistanceMetres: commute?.distanceMetres ?? null,
          commuteEstimated: commute?.estimated ?? null,
        };
      })
  );

  return ok({ commutes: results, routingProviderConfigured: hasRoutingProvider() });
});
