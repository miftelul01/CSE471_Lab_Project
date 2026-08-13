import { badRequest, notImplemented, ok, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** M3.4 Automated Chore Rotation — Mahia Tanzin. */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before setting up chores.");

  const chores = await prisma.chore.findMany({
    where: { houseId, isActive: true },
    include: { assignments: { include: { user: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return ok({ chores });
});

/** TODO (M3.4): create a chore; default rotationOrder to active house members. */
export const POST = withUser(async () => notImplemented("Creating chores"));

/** TODO (M3.4): mark an assignment COMPLETED (assignee or house admin only). */
export const PATCH = withUser(async () => notImplemented("Completing a chore"));
