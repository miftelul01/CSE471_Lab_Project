import { badRequest, forbidden, notFound, ok, readJson, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { deleteChoreTask, getOrCreateChoreTaskList } from "@/lib/google";
import { prisma } from "@/lib/prisma";

/**
 * M3.4 enhancement A — claim an open marketplace post, or the poster
 * cancels it. Claiming reassigns the underlying ChoreAssignment; the old
 * task (which lives under the previous assignee's own Google account) is
 * removed and the assignment left for the cron's reconcile pass to create a
 * fresh one under the new assignee — same handling as an accepted swap, and
 * for the same reason: a Google task id isn't portable across accounts.
 */

export const dynamic = "force-dynamic";

class AlreadyClaimedError extends Error {}

export const PATCH = withUser(async (user, req: Request, { params }: { params: { id: string } }) => {
  const body = await readJson<{ action: "claim" | "cancel" }>(req);
  if (body?.action !== "claim" && body?.action !== "cancel") return badRequest('action must be "claim" or "cancel"');

  const post = await prisma.choreMarketplacePost.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      postedByUserId: true,
      assignmentId: true,
      assignment: { select: { chore: { select: { houseId: true } } } },
    },
  });
  if (!post) return notFound("No such marketplace post");
  if (post.status !== "OPEN") return badRequest(`This post is already ${post.status.toLowerCase()}.`);

  if (body.action === "cancel") {
    if (post.postedByUserId !== user.id) return forbidden("Only the original poster can cancel this.");
    const updated = await prisma.choreMarketplacePost.update({ where: { id: post.id }, data: { status: "CANCELLED" } });
    return ok(updated);
  }

  // Claim: any other active member of the same house.
  if (post.postedByUserId === user.id) return badRequest("You can't claim your own post.");
  const houseId = post.assignment.chore.houseId;
  const activeHouseId = await getActiveHouseId(user.id);
  if (activeHouseId !== houseId) return forbidden("You can only claim chores in your own house.");

  const before = await prisma.choreAssignment.findUnique({
    where: { id: post.assignmentId },
    select: { userId: true, googleTaskId: true },
  });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Re-check status inside the transaction so two near-simultaneous
      // claims can't both succeed — whichever commits first wins, the loser
      // gets a clean "already claimed" instead of corrupting the assignment.
      const fresh = await tx.choreMarketplacePost.findUnique({ where: { id: post.id }, select: { status: true } });
      if (fresh?.status !== "OPEN") throw new AlreadyClaimedError();

      await tx.choreAssignment.update({
        where: { id: post.assignmentId },
        data: { userId: user.id, googleTaskId: null, googleSyncPendingAt: new Date() },
      });
      return tx.choreMarketplacePost.update({
        where: { id: post.id },
        data: { status: "CLAIMED", claimedByUserId: user.id, claimedAt: new Date() },
      });
    });

    if (before?.googleTaskId) {
      try {
        const listId = await getOrCreateChoreTaskList(before.userId);
        await deleteChoreTask(before.userId, listId, before.googleTaskId);
      } catch {
        // Worst case a stale task lingers in the old assignee's list.
      }
    }

    return ok(updated);
  } catch (err) {
    if (err instanceof AlreadyClaimedError) return badRequest("Someone else already claimed this.");
    throw err;
  }
});
