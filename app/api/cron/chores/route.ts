import { ok, unauthorized } from "@/lib/api";
import { authorizedCron } from "@/lib/cron";
import {
  computeNextDueDate,
  getIneligibleAssignees,
  pickNextAssignee,
  todayUtcMidnight,
} from "@/lib/chores";
import {
  createChoreTask,
  getOrCreateChoreTaskList,
  GOOGLE_SCOPES,
  listChoreTasks,
  updateChoreTask,
} from "@/lib/google";
import { prisma } from "@/lib/prisma";

/**
 * M3.4 daily rotation job. Runs once a day (see vercel.json) and evaluates
 * every active chore regardless of frequency — DAILY chores need daily
 * evaluation anyway, and WEEKLY/BIWEEKLY/MONTHLY chores just find "not due
 * yet" on most runs, the same "one job evaluates everything" shape as
 * M2.4's neighborhood cron.
 *
 * ── WHAT THIS JOB IS AND IS NOT ─────────────────────────────────────────────
 * The DB write (who's assigned what) always commits independent of Google's
 * outcome — a Google outage or a resident who's never connected their
 * account must never block the assignment that actually matters from being
 * recorded. Google Tasks push/pull is best-effort, retried via
 * googleSyncPendingAt, and never rolled back into. See the three passes
 * below.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const dynamic = "force-dynamic";

/**
 * A self-imposed ceiling on Google-touching operations for one run.
 *
 * Unlike lib/mapProviders.ts's per-user enforceRateLimit, nothing meters
 * this job's Google calls at all — its only real throttle is "the schedule
 * only fires it once a day." That's an external assumption, not a
 * guarantee: a leaked CRON_SECRET or a misconfigured schedule would
 * otherwise let this hammer every connected resident's Google account with
 * no internal limit. Each unit here is roughly one push/reconcile/pull
 * operation (which itself may cost 1-2 real HTTP calls via
 * getOrCreateChoreTaskList + the action) — approximate, but enough to cap
 * total volume if this fires far more often than intended.
 */
const MAX_GOOGLE_OPERATIONS_PER_RUN = 200;

export async function GET(req: Request) {
  if (!authorizedCron(req)) return unauthorized("Not authorized");

  const today = todayUtcMidnight();
  let googleOpsRemaining = MAX_GOOGLE_OPERATIONS_PER_RUN;

  /* ── Pass 1: create this period's assignment for every due chore ──────── */

  const activeChores = await prisma.chore.findMany({
    where: { isActive: true },
    include: { assignments: { orderBy: { dueDate: "desc" }, take: 1 } },
  });

  let created = 0;
  let gaps = 0;
  let pushSucceeded = 0;
  let pushDeferred = 0;

  for (const chore of activeChores) {
    const lastAssignment = chore.assignments[0] ?? null;
    const nextDue = computeNextDueDate(chore, lastAssignment?.dueDate ?? null);
    if (nextDue.getTime() > today.getTime()) continue; // not due yet

    const ineligible = await getIneligibleAssignees(chore.houseId, chore.rotationOrder, nextDue);
    const pick = pickNextAssignee(chore.rotationOrder, chore.lastAssignedIndex, ineligible);
    if (!pick) {
      // Nobody eligible after a full wrap — a real coverage gap. Don't
      // create an assignment, don't advance the cursor; surfaced live on
      // the admin's chores page (GET /api/chores) rather than silently
      // dropped.
      gaps++;
      continue;
    }

    let newAssignmentId: string;
    try {
      newAssignmentId = await prisma.$transaction(async (tx) => {
        await tx.chore.update({ where: { id: chore.id }, data: { lastAssignedIndex: pick.index } });
        const created = await tx.choreAssignment.create({
          data: { choreId: chore.id, userId: pick.userId, dueDate: nextDue },
        });
        return created.id;
      });
      created++;
    } catch (err) {
      // Unique index on (choreId, dueDate): this chore's occurrence for
      // this due date was already created (a previous run today, or a
      // duplicate trigger) — exactly the idempotency the schema promises.
      if ((err as { code?: string }).code === "P2002") continue;
      throw err;
    }

    if (googleOpsRemaining <= 0) {
      // Over budget for this run — the assignment above is already
      // committed either way; just defer the push to tomorrow's reconcile
      // pass rather than making an unbounded number of Google calls.
      await prisma.choreAssignment.update({ where: { id: newAssignmentId }, data: { googleSyncPendingAt: new Date() } });
      pushDeferred++;
      continue;
    }
    googleOpsRemaining--;

    try {
      const listId = await getOrCreateChoreTaskList(pick.userId);
      const taskId = await createChoreTask(pick.userId, listId, { title: chore.name, notes: chore.description ?? undefined, due: nextDue });
      await prisma.choreAssignment.update({ where: { id: newAssignmentId }, data: { googleTaskId: taskId } });
      pushSucceeded++;
    } catch {
      // Not connected, rate-limited, or a genuine outage — the assignment
      // above is already committed. Defer to the reconcile pass.
      await prisma.choreAssignment.update({ where: { id: newAssignmentId }, data: { googleSyncPendingAt: new Date() } });
      pushDeferred++;
    }
  }

  /* ── Pass 2: reconcile — retry anything flagged googleSyncPendingAt ────── */
  //
  // googleTaskId null + pending  -> needs a task CREATED under the current
  //   assignee (a failed initial push above, or a swap/marketplace claim
  //   that already deleted the old owner's task and cleared this field).
  // googleTaskId set + pending   -> a due-date/notes push failed; retry the
  //   update under the current (unchanged) assignee.

  // Skip anyone already known to need reconnecting — retrying them here is
  // guaranteed to fail (their refresh token is already dead) and just
  // wastes a call every single day until they reconnect, which flips
  // needsReconnectAt back to null and lets them re-enter this pass.
  const needsReconnectUserIds = new Set(
    (
      await prisma.googleCredential.findMany({
        where: { needsReconnectAt: { not: null } },
        select: { userId: true },
      })
    ).map((c) => c.userId)
  );

  const pendingAssignments = (
    await prisma.choreAssignment.findMany({
      where: { googleSyncPendingAt: { not: null }, status: { not: "COMPLETED" } },
      select: { id: true, userId: true, choreId: true, dueDate: true, googleTaskId: true, chore: { select: { name: true, description: true } } },
    })
  ).filter((a) => !needsReconnectUserIds.has(a.userId));

  let reconciled = 0;
  let reconcileStillPending = 0;
  for (const assignment of pendingAssignments) {
    if (googleOpsRemaining <= 0) {
      reconcileStillPending++;
      continue;
    }
    googleOpsRemaining--;
    try {
      const listId = await getOrCreateChoreTaskList(assignment.userId);
      if (assignment.googleTaskId) {
        await updateChoreTask(assignment.userId, listId, assignment.googleTaskId, { due: assignment.dueDate });
      } else {
        const taskId = await createChoreTask(assignment.userId, listId, {
          title: assignment.chore.name,
          notes: assignment.chore.description ?? undefined,
          due: assignment.dueDate,
        });
        await prisma.choreAssignment.update({ where: { id: assignment.id }, data: { googleTaskId: taskId } });
      }
      await prisma.choreAssignment.update({ where: { id: assignment.id }, data: { googleSyncPendingAt: null } });
      reconciled++;
    } catch {
      reconcileStillPending++;
    }
  }

  const pendingSubtasks = (
    await prisma.choreSubtask.findMany({
      where: { googleSyncPendingAt: { not: null }, status: { not: "COMPLETED" } },
      select: { id: true, userId: true, title: true, googleTaskId: true },
    })
  ).filter((s) => !needsReconnectUserIds.has(s.userId));

  for (const subtask of pendingSubtasks) {
    if (googleOpsRemaining <= 0) {
      reconcileStillPending++;
      continue;
    }
    googleOpsRemaining--;
    try {
      const listId = await getOrCreateChoreTaskList(subtask.userId);
      if (!subtask.googleTaskId) {
        const taskId = await createChoreTask(subtask.userId, listId, { title: subtask.title });
        await prisma.choreSubtask.update({ where: { id: subtask.id }, data: { googleTaskId: taskId } });
      }
      await prisma.choreSubtask.update({ where: { id: subtask.id }, data: { googleSyncPendingAt: null } });
      reconciled++;
    } catch {
      reconcileStillPending++;
    }
  }

  /* ── Pass 3: pull completion status back from Google ───────────────────── */
  //
  // One listChoreTasks call per connected resident, not one per assignment.

  const usersWithTasksScope = await prisma.googleCredential.findMany({
    where: { scopes: { has: GOOGLE_SCOPES.tasks }, needsReconnectAt: null },
    select: { userId: true },
  });

  let pulled = 0;
  let pullSkippedForBudget = 0;
  for (const { userId } of usersWithTasksScope) {
    if (googleOpsRemaining <= 0) {
      pullSkippedForBudget++;
      continue;
    }
    googleOpsRemaining--;

    const [openAssignments, openSubtasks] = await Promise.all([
      prisma.choreAssignment.findMany({
        where: { userId, status: "PENDING", googleTaskId: { not: null } },
        select: { id: true, googleTaskId: true },
      }),
      prisma.choreSubtask.findMany({
        where: { userId, status: "PENDING", googleTaskId: { not: null } },
        select: { id: true, assignmentId: true, googleTaskId: true },
      }),
    ]);
    if (openAssignments.length === 0 && openSubtasks.length === 0) continue;

    let googleTasks;
    try {
      const listId = await getOrCreateChoreTaskList(userId);
      googleTasks = await listChoreTasks(userId, listId);
    } catch {
      continue; // this resident's Google account is unreachable this run
    }

    const completedGoogleIds = new Set(
      googleTasks.filter((t) => t.status === "completed").map((t) => t.id)
    );

    for (const assignment of openAssignments) {
      if (!assignment.googleTaskId || !completedGoogleIds.has(assignment.googleTaskId)) continue;
      await prisma.choreAssignment.update({
        where: { id: assignment.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      pulled++;
    }

    const completedParents = new Set<string>();
    for (const subtask of openSubtasks) {
      if (!subtask.googleTaskId || !completedGoogleIds.has(subtask.googleTaskId)) continue;
      await prisma.choreSubtask.update({
        where: { id: subtask.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      completedParents.add(subtask.assignmentId);
      pulled++;
    }

    for (const assignmentId of completedParents) {
      const remaining = await prisma.choreSubtask.count({
        where: { assignmentId, status: { not: "COMPLETED" } },
      });
      if (remaining === 0) {
        await prisma.choreAssignment.update({
          where: { id: assignmentId },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
      }
    }
  }

  return ok({
    ranAt: new Date().toISOString(),
    assignmentsCreated: created,
    coverageGaps: gaps,
    googlePushSucceeded: pushSucceeded,
    googlePushDeferred: pushDeferred,
    googleReconciled: reconciled,
    googleStillPending: reconcileStillPending,
    googleSkippedNeedsReconnect: needsReconnectUserIds.size,
    completionsPulled: pulled,
    pullSkippedForBudget,
    googleOperationBudgetRemaining: googleOpsRemaining,
  });
}
