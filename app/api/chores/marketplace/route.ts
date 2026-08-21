import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * M3.4 enhancement A — chore marketplace. A shared pool any resident can
 * claim from, distinct from swaps (lib/authz.ts's assertCanSetChoreSwapStatus)
 * which need a specific willing partner.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house first.");

  const posts = await prisma.choreMarketplacePost.findMany({
    where: { status: "OPEN", assignment: { chore: { houseId } } },
    include: {
      assignment: { include: { chore: { select: { name: true } } } },
      postedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return ok({ posts });
});

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<{ assignmentId: string }>(req);
  if (!body?.assignmentId) return badRequest("assignmentId is required");

  const assignment = await prisma.choreAssignment.findUnique({
    where: { id: body.assignmentId },
    select: { id: true, userId: true, status: true },
  });
  if (!assignment) return badRequest("No such assignment.");
  if (assignment.userId !== user.id) return badRequest("You can only post your own assignment.");
  if (assignment.status !== "PENDING") return badRequest("Only a pending assignment can be posted.");

  try {
    const post = await prisma.choreMarketplacePost.create({
      data: { assignmentId: assignment.id, postedByUserId: user.id },
    });
    return ok(post, 201);
  } catch (err) {
    // Partial unique index: one open post per assignment.
    if ((err as { code?: string }).code === "P2002") {
      return badRequest("This assignment is already posted.");
    }
    throw err;
  }
});
