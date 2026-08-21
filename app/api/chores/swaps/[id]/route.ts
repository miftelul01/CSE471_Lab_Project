import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { assertCanSetChoreSwapStatus, isHouseMember } from "@/lib/authz";
import { deleteChoreTask, getOrCreateChoreTaskList } from "@/lib/google";
import { prisma } from "@/lib/prisma";
import type { JoinRequestStatus } from "@prisma/client";

/** M3.4 — proposer cancels; target accepts or rejects. */

export const dynamic = "force-dynamic";

export const PATCH = withUser(async (user, req: Request, { params }: { params: { id: string } }) => {
  const body = await readJson<{ status: JoinRequestStatus }>(req);
  if (body?.status !== "ACCEPTED" && body?.status !== "REJECTED" && body?.status !== "CANCELLED") {
    return badRequest("status must be ACCEPTED, REJECTED, or CANCELLED");
  }

  const existing = await assertCanSetChoreSwapStatus(user, params.id, body.status);

  if (body.status !== "ACCEPTED") {
    const updated = await prisma.choreSwapRequest.update({ where: { id: params.id }, data: { status: body.status } });
    return ok(updated);
  }

  // Membership can lapse between proposing and accepting a swap — the
  // rotation cron treats "active member" as a hard, point-in-time
  // requirement (lib/chores.ts's getIneligibleAssignees), and marketplace
  // claiming already re-checks it at claim time; a swap must not be the one
  // path that reassigns a chore onto (or off of) someone who's since left.
  const proposerAssignment = await prisma.choreAssignment.findUnique({
    where: { id: existing.proposerAssignmentId },
    select: { chore: { select: { houseId: true } } },
  });
  const houseId = proposerAssignment?.chore.houseId;
  if (
    !houseId ||
    !(await isHouseMember(existing.proposerUserId, houseId)) ||
    !(await isHouseMember(existing.targetUserId, houseId))
  ) {
    return badRequest("One of you is no longer an active member of this house — the swap can't complete.");
  }

  // A task id is only meaningful under the Google account it was created in
  // — swapping the assignee means the OLD task belongs to the OLD assignee's
  // account, not the new one. Capture both before reassigning, so the old
  // tasks can be removed from their original owners' lists afterward, and
  // the assignment is left with googleTaskId cleared + googleSyncPendingAt
  // set, so the cron's reconcile pass creates a fresh task under the new
  // assignee rather than trying to "update" a task that isn't theirs.
  const [proposerBefore, targetBefore] = await Promise.all([
    prisma.choreAssignment.findUnique({
      where: { id: existing.proposerAssignmentId },
      select: { userId: true, googleTaskId: true },
    }),
    prisma.choreAssignment.findUnique({
      where: { id: existing.targetAssignmentId },
      select: { userId: true, googleTaskId: true },
    }),
  ]);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.choreAssignment.update({
      where: { id: existing.proposerAssignmentId },
      data: { userId: existing.targetUserId, googleTaskId: null, googleSyncPendingAt: new Date() },
    });
    await tx.choreAssignment.update({
      where: { id: existing.targetAssignmentId },
      data: { userId: existing.proposerUserId, googleTaskId: null, googleSyncPendingAt: new Date() },
    });
    return tx.choreSwapRequest.update({ where: { id: params.id }, data: { status: "ACCEPTED" } });
  });

  // Best-effort cleanup of the old tasks — a failure here just means the
  // reconcile pass (or a stray leftover task) rather than a broken swap;
  // the DB reassignment above already committed either way.
  for (const before of [proposerBefore, targetBefore]) {
    if (!before?.googleTaskId) continue;
    try {
      const listId = await getOrCreateChoreTaskList(before.userId);
      await deleteChoreTask(before.userId, listId, before.googleTaskId);
    } catch {
      // Nothing to do — worst case a stale task lingers in the old
      // assignee's list until they notice or reconnect.
    }
  }

  return ok(updated);
});
