import { badRequest, forbidden, notFound, ok, readJson, withUser } from "@/lib/api";
import { isHouseAdmin } from "@/lib/authz";
import { areAllSubtasksComplete } from "@/lib/chores";
import { getOrCreateChoreTaskList, updateChoreTask } from "@/lib/google";
import { prisma } from "@/lib/prisma";

/**
 * M3.4 enhancement D — complete one piece of a split chore. The subtask's
 * own assignee or a house admin only. Completing the last outstanding
 * subtask auto-completes the parent ChoreAssignment — this is the concrete
 * mechanism for "the parent only completes once every sub-task does."
 */

export const dynamic = "force-dynamic";

export const PATCH = withUser(
  async (user, req: Request, { params }: { params: { assignmentId: string; subtaskId: string } }) => {
    const body = await readJson<{ status: "COMPLETED" }>(req);
    if (body?.status !== "COMPLETED") return badRequest('status must be "COMPLETED"');

    const subtask = await prisma.choreSubtask.findUnique({
      where: { id: params.subtaskId },
      select: {
        id: true,
        assignmentId: true,
        userId: true,
        status: true,
        googleTaskId: true,
      },
    });
    if (!subtask || subtask.assignmentId !== params.assignmentId) return notFound("No such sub-task");

    const assignment = await prisma.choreAssignment.findUnique({
      where: { id: params.assignmentId },
      select: { chore: { select: { houseId: true } } },
    });
    if (!assignment) return notFound("No such assignment");

    const admin = await isHouseAdmin(user.id, assignment.chore.houseId);
    if (subtask.userId !== user.id && !admin) {
      return forbidden("Only this sub-task's assignee or a house admin can complete it.");
    }
    if (subtask.status === "COMPLETED") return ok({ id: subtask.id, status: "COMPLETED" });

    await prisma.choreSubtask.update({
      where: { id: subtask.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    if (subtask.googleTaskId) {
      try {
        const listId = await getOrCreateChoreTaskList(subtask.userId);
        await updateChoreTask(subtask.userId, listId, subtask.googleTaskId, { completed: true });
      } catch {
        await prisma.choreSubtask.update({ where: { id: subtask.id }, data: { googleSyncPendingAt: new Date() } });
      }
    }

    let parentCompleted = false;
    if (await areAllSubtasksComplete(params.assignmentId)) {
      await prisma.choreAssignment.update({
        where: { id: params.assignmentId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      parentCompleted = true;
    }

    return ok({ id: subtask.id, status: "COMPLETED", parentCompleted });
  }
);
