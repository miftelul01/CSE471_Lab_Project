import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * M3.4 — direct 1-to-1 swaps (spec requirement 3, manual override).
 * PENDING -> ACCEPTED / REJECTED / CANCELLED, same lifecycle as JoinRequest;
 * see app/api/chores/swaps/[id]/route.ts for the transition endpoint and
 * lib/authz.ts's assertCanSetChoreSwapStatus for the asymmetric rule.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const requests = await prisma.choreSwapRequest.findMany({
    where: { OR: [{ proposerUserId: user.id }, { targetUserId: user.id }] },
    include: {
      proposerAssignment: { include: { chore: { select: { name: true } } } },
      targetAssignment: { include: { chore: { select: { name: true } } } },
      proposer: { select: { id: true, name: true } },
      target: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return ok({ requests });
});

export const POST = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house first.");

  const body = await readJson<{ proposerAssignmentId: string; targetAssignmentId: string; message?: string }>(req);
  if (!body?.proposerAssignmentId || !body?.targetAssignmentId) {
    return badRequest("proposerAssignmentId and targetAssignmentId are required");
  }
  if (body.proposerAssignmentId === body.targetAssignmentId) {
    return badRequest("Can't propose a swap with yourself.");
  }

  const [proposerAssignment, targetAssignment] = await Promise.all([
    prisma.choreAssignment.findUnique({
      where: { id: body.proposerAssignmentId },
      select: { id: true, userId: true, status: true, dueDate: true, chore: { select: { houseId: true } } },
    }),
    prisma.choreAssignment.findUnique({
      where: { id: body.targetAssignmentId },
      select: { id: true, userId: true, status: true, dueDate: true, chore: { select: { houseId: true } } },
    }),
  ]);
  if (!proposerAssignment || !targetAssignment) return badRequest("One of those assignments doesn't exist.");
  if (proposerAssignment.userId !== user.id) return badRequest("You can only offer your own assignment.");
  if (targetAssignment.userId === user.id) return badRequest("Pick someone else's assignment to swap for.");
  if (proposerAssignment.chore.houseId !== houseId || targetAssignment.chore.houseId !== houseId) {
    return badRequest("Both assignments must belong to your own house.");
  }
  if (proposerAssignment.status !== "PENDING" || targetAssignment.status !== "PENDING") {
    return badRequest("Both assignments must still be pending.");
  }

  try {
    const request = await prisma.choreSwapRequest.create({
      data: {
        proposerAssignmentId: proposerAssignment.id,
        targetAssignmentId: targetAssignment.id,
        proposerUserId: user.id,
        targetUserId: targetAssignment.userId,
        message: body.message?.trim() || null,
      },
    });
    return ok(request, 201);
  } catch (err) {
    // Partial unique index: one open swap proposal per assignment at a time.
    if ((err as { code?: string }).code === "P2002") {
      return badRequest("You already have an open swap proposal for that assignment.");
    }
    throw err;
  }
});
