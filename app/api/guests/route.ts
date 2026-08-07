import { badRequest, notImplemented, ok, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** M1.3 Guest Registration & Accountability Log — Md. Mahidul Alam Araf. */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before using the guest log.");

  const guests = await prisma.guestLog.findMany({
    where: { houseId },
    include: { host: { select: { name: true } } },
    orderBy: { checkedInAt: "desc" },
  });
  return ok({ guests });
});

/**
 * TODO (M1.3):
 *  1. Validate guestName is present; purpose and expectedCheckOut optional.
 *  2. Create with houseId from getActiveHouseId and hostUserId: user.id.
 *     Call assertHouseMember(user, houseId) from lib/authz.ts first — there is
 *     no Row Level Security any more, so that check is the only thing stopping
 *     someone logging a guest into a house they don't live in.
 *  3. Notify the house admin, then set notifiedAdminAt so it fires once.
 */
export const POST = withUser(async () => notImplemented("Guest check-in"));

/** TODO (M1.3): check-out — set status CHECKED_OUT and checkedOutAt. */
export const PATCH = withUser(async () => notImplemented("Guest check-out"));
