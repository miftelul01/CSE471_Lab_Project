import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { assertCanSetHousePin, requireActiveHouseId } from "@/lib/authz";
import { getHousePin, getSuggestedPin } from "@/lib/neighborhood.server";
import { prisma } from "@/lib/prisma";

/**
 * M2.4 — the house origin point.
 *
 * Every distance and every route in this feature is measured from one point,
 * and placing it is a required one-time step in house setup. Until it is set,
 * distance and routing stay switched off with a prompt rather than guessing:
 * a ranked list built around the wrong building is confidently wrong, which is
 * worse than a list that admits it cannot rank yet.
 *
 * Browser geolocation is deliberately not accepted as a substitute. It answers
 * "where is this phone", which on the bus home is a different question.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const houseId = await requireActiveHouseId(user);
  const [pin, suggested] = await Promise.all([getHousePin(houseId), getSuggestedPin(houseId)]);

  return ok({
    pin,
    // Pre-filled from the Module 1 listing the house came from, so the admin is
    // confirming a suggestion rather than finding their own front door on a
    // blank map.
    suggested: pin ? null : suggested,
  });
});

export const PUT = withUser(async (user, req: Request) => {
  const houseId = await requireActiveHouseId(user);
  await assertCanSetHousePin(user, houseId);

  const body = await readJson<{ lat?: number; lng?: number }>(req);
  if (!body) return badRequest("Invalid JSON body");

  const { lat, lng } = body;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return badRequest("Send a numeric lat and lng.");
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return badRequest("Those coordinates are outside the range of the earth.");
  }

  const house = await prisma.house.update({
    where: { id: houseId },
    data: {
      latitude: lat,
      longitude: lng,
      // The timestamp is the actual switch. Coordinates alone only mean the
      // house has an address on file; this means a human looked at the map and
      // said "that is our gate".
      mapPinSetAt: new Date(),
      mapPinSetById: user.id,
    },
    select: { latitude: true, longitude: true, mapPinSetAt: true },
  });

  return ok({ pin: { lat: house.latitude, lng: house.longitude, setAt: house.mapPinSetAt } });
});
