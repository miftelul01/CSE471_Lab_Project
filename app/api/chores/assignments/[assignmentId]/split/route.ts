import { badRequest, forbidden, notFound, ok, readJson, withUser } from "@/lib/api";
import { isHouseAdmin } from "@/lib/authz";
import { deleteChoreTask, getOrCreateChoreTaskList } from "@/lib/google";
import { prisma } from "@/lib/prisma";

/**
 * M3.4 enhancement D — chore splitting for large tasks. House-admin only.
 * Breaks one occurrence into sub-tasks assigned to different residents; the
 * parent's own Google task (if the rotation cron already pushed one to the
 * original assignee) is removed — the real per-person work items become
 * each subtask's own Google task, one per assignee, so nobody ends up with
 * both "do the whole thing" and "do my piece" sitting in their list.
 */

export const dynamic = "force-dynamic";

export const POST = withUser(async (user, req: Request, { params }: { params: { assignmentId: string } }) => {
  const body = await readJson<{ subtasks: { userId: string; title: string }[] }>(req);
  if (!body?.subtasks || body.subtasks.length < 2) {
    return badRequest("Provide at least 2 sub-tasks to split this chore.");
  }
  if (body.subtasks.some((s) => !s.userId || !s.title?.trim())) {
    return badRequest("Every sub-task needs a userId and a title.");
  }

  const assignment = await prisma.choreAssignment.findUnique({
    where: { id: params.assignmentId },
    select: {
      id: true,
      status: true,
      dueDate: true,
      googleTaskId: true,
      userId: true,
      chore: { select: { houseId: true, name: true } },
    },
  });
  if (!assignment) return notFound("No such assignment");

  const houseId = assignment.chore.houseId;
  if (!(await isHouseAdmin(user.id, houseId))) return forbidden("Only a house admin can split a chore.");
  if (assignment.status === "COMPLETED") return badRequest("Can't split a completed chore.");

  const existingSubtasks = await prisma.choreSubtask.count({ where: { assignmentId: assignment.id } });
  if (existingSubtasks > 0) return badRequest("This chore is already split.");

  const candidateIds = Array.from(new Set(body.subtasks.map((s) => s.userId)));
  const activeIds = new Set(
    (
      await prisma.houseMember.findMany({
        where: { houseId, userId: { in: candidateIds }, status: "ACTIVE" },
        select: { userId: true },
      })
    ).map((m) => m.userId)
  );
  const invalid = candidateIds.filter((id) => !activeIds.has(id));
  if (invalid.length > 0) return badRequest("Every sub-task assignee must be an active member of this house.");

  const created = await prisma.$transaction(
    body.subtasks.map((s) =>
      prisma.choreSubtask.create({
        data: { assignmentId: assignment.id, userId: s.userId, title: s.title.trim() },
      })
    )
  );

  const oldGoogleTaskId = assignment.googleTaskId;
  if (oldGoogleTaskId) {
    // Clear the DB state FIRST, then attempt the actual Google deletion —
    // not the other way around. If the delete call fails and this update
    // ran only on success, the stale googleTaskId would be left in place;
    // the cron's reconcile pass would then find googleTaskId still set and
    // try to UPDATE that now-orphaned "do the whole chore" task instead of
    // deleting it, leaving a permanent duplicate in the original assignee's
    // Google Tasks list (same failure mode the swap/marketplace routes
    // avoid by doing this in the same order).
    await prisma.choreAssignment.update({
      where: { id: assignment.id },
      data: { googleTaskId: null, googleSyncPendingAt: new Date() },
    });
    try {
      const listId = await getOrCreateChoreTaskList(assignment.userId);
      await deleteChoreTask(assignment.userId, listId, oldGoogleTaskId);
      await prisma.choreAssignment.update({ where: { id: assignment.id }, data: { googleSyncPendingAt: null } });
    } catch {
      // Worst case a stale "whole chore" task lingers until the assignee
      // notices or reconnects — googleTaskId is already null either way,
      // so nothing will try to update it as if it still represented this
      // (now split) occurrence.
    }
  }

  // Each subtask's own Google push is deferred to the cron's reconcile
  // pass (googleSyncPendingAt) rather than attempted inline here, the same
  // choice the swap/marketplace routes make — an interactive request
  // shouldn't block on a possibly-slow external API call for every piece.
  for (const subtask of created) {
    await prisma.choreSubtask.update({ where: { id: subtask.id }, data: { googleSyncPendingAt: new Date() } });
  }

  return ok({ subtasks: created }, 201);
});
