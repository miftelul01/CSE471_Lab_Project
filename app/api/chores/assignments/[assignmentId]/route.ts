import { badRequest, forbidden, notFound, ok, readJson, withUser } from "@/lib/api";
import { isHouseAdmin } from "@/lib/authz";
import { areAllSubtasksComplete } from "@/lib/chores";
import { getOrCreateChoreTaskList, updateChoreTask } from "@/lib/google";
import { prisma } from "@/lib/prisma";

/**
 * M3.4 — mark an assignment COMPLETED. The assignee or the house admin only.
 * Blocked while the assignment has incomplete subtasks (spec/enhancement D:
 * "the parent only completes once every sub-task does") — complete each
 * subtask individually via .../subtasks/[subtaskId] instead, which
 * auto-completes the parent once the last one finishes.
 */

export const dynamic = "force-dynamic";

export const PATCH = withUser(async (user, req: Request, { params }: { params: { assignmentId: string } }) => {
  const body = await readJson<{ action: "complete" }>(req);
  if (body?.action !== "complete") return badRequest('action must be "complete"');

  const assignment = await prisma.choreAssignment.findUnique({
    where: { id: params.assignmentId },
    select: { id: true, userId: true, status: true, googleTaskId: true, chore: { select: { houseId: true } } },
  });
  if (!assignment) return notFound("No such assignment");

  const isAssignee = assignment.userId === user.id;
  const admin = await isHouseAdmin(user.id, assignment.chore.houseId);
  if (!isAssignee && !admin) return forbidden("Only the assignee or a house admin can complete this.");

  if (assignment.status === "COMPLETED") return ok({ id: assignment.id, status: "COMPLETED" });

  if (!(await areAllSubtasksComplete(assignment.id))) {
    return badRequest("This chore is split into sub-tasks — complete each one instead.");
  }

  const completedAt = new Date();
  const updated = await prisma.choreAssignment.update({
    where: { id: assignment.id },
    data: { status: "COMPLETED", completedAt },
  });

  if (assignment.googleTaskId) {
    try {
      // Best-effort: local completion is already committed above regardless
      // of whether Google's copy can be updated right now.
      const listId = await getOrCreateChoreTaskList(assignment.userId);
      await updateChoreTask(assignment.userId, listId, assignment.googleTaskId, { completed: true });
    } catch {
      await prisma.choreAssignment.update({
        where: { id: assignment.id },
        data: { googleSyncPendingAt: new Date() },
      });
    }
  }

  return ok(updated);
});
