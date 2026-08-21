import { badRequest, forbidden, notFound, ok, readJson, withUser } from "@/lib/api";
import { isHouseAdmin } from "@/lib/authz";
import { todayUtcMidnight, toUtcMidnight } from "@/lib/chores";
import { getOrCreateChoreTaskList, updateChoreTask } from "@/lib/google";
import { prisma } from "@/lib/prisma";

/**
 * M3.4 — change an assignment's due date. Backs the calendar-conflict
 * enhancement's "accept the suggested alternative" action, and is also
 * usable standalone. Assignee or house admin only, pre-completion only —
 * once voting/work is done a due date change is meaningless. Blocked by
 * the (choreId, dueDate) unique index if the new date collides with an
 * existing occurrence of the same chore.
 */

export const dynamic = "force-dynamic";

export const PATCH = withUser(async (user, req: Request, { params }: { params: { assignmentId: string } }) => {
  const body = await readJson<{ dueDate: string }>(req);
  const newDueDate = body?.dueDate ? new Date(body.dueDate) : null;
  if (!newDueDate || Number.isNaN(newDueDate.getTime())) return badRequest("dueDate must be a valid date");

  const assignment = await prisma.choreAssignment.findUnique({
    where: { id: params.assignmentId },
    select: { id: true, userId: true, status: true, choreId: true, googleTaskId: true, chore: { select: { houseId: true } } },
  });
  if (!assignment) return notFound("No such assignment");

  const isAssignee = assignment.userId === user.id;
  const admin = await isHouseAdmin(user.id, assignment.chore.houseId);
  if (!isAssignee && !admin) return forbidden("Only the assignee or a house admin can reschedule this.");
  if (assignment.status === "COMPLETED") return badRequest("Can't reschedule a completed chore.");

  const snappedDate = toUtcMidnight(newDueDate);
  if (snappedDate.getTime() < todayUtcMidnight().getTime()) {
    return badRequest("Can't reschedule to a date in the past.");
  }

  const updated = await prisma.choreAssignment.update({
    where: { id: assignment.id },
    data: { dueDate: snappedDate },
  });

  if (assignment.googleTaskId) {
    try {
      const listId = await getOrCreateChoreTaskList(assignment.userId);
      await updateChoreTask(assignment.userId, listId, assignment.googleTaskId, { due: snappedDate });
    } catch {
      await prisma.choreAssignment.update({
        where: { id: assignment.id },
        data: { googleSyncPendingAt: new Date() },
      });
    }
  }

  return ok(updated);
});
