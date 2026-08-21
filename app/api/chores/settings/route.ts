import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { assertCanManageHouse } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

/**
 * M3.4 enhancement E's toggle. Small, dedicated route rather than extending
 * app/api/houses/route.ts (owned by another module, no existing house-
 * settings PATCH to extend) — kept additive and scoped to this feature.
 */

export const dynamic = "force-dynamic";

export const PATCH = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house first.");
  await assertCanManageHouse(user, houseId);

  const body = await readJson<{ choreQualityRatingEnabled: boolean }>(req);
  if (typeof body?.choreQualityRatingEnabled !== "boolean") {
    return badRequest("choreQualityRatingEnabled must be a boolean.");
  }

  const house = await prisma.house.update({
    where: { id: houseId },
    data: { choreQualityRatingEnabled: body.choreQualityRatingEnabled },
    select: { choreQualityRatingEnabled: true },
  });
  return ok(house);
});
