import type { ChoreFrequency } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * M3.4 Automated Chore Rotation — Mahia Tanzin.
 *
 * Rotation, eligibility, and due-date logic, kept separate from the cron
 * route (app/api/cron/chores/route.ts) so it's directly callable/testable
 * without going through an HTTP request, mirroring lib/joinRequests.ts and
 * lib/menu.ts's split between "domain logic" and "the route that calls it."
 */

/* ── Absences ──────────────────────────────────────────────────────────── */

/**
 * A single absence can cover at most this many days. Without a cap, a
 * resident could self-service a multi-year "absence" and permanently opt
 * out of the rotation with no admin approval — the rotation's fairness rule
 * (whoever absorbs a skip differs each time) quietly hides this from the
 * coverage-gap banner, since someone else keeps covering forever, so a
 * reasonable bound here is the only real guardrail short of requiring
 * admin sign-off, which the spec doesn't ask for.
 */
export const MAX_ABSENCE_DAYS = 90;

export function validateAbsenceRange(startDate: Date, endDate: Date): string | null {
  if (endDate.getTime() < startDate.getTime()) return "endDate can't be before startDate.";
  const spanDays = Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (spanDays > MAX_ABSENCE_DAYS) {
    return `An absence can cover at most ${MAX_ABSENCE_DAYS} days — split a longer stretch into separate absences if you need one.`;
  }
  return null;
}

/* ── Due-date math ─────────────────────────────────────────────────────── */

/** Midnight UTC for `date` — chore due dates are DATE columns, not timestamps. */
export function toUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function todayUtcMidnight(): Date {
  return toUtcMidnight(new Date());
}

/** The next occurrence after `from`, per the chore's frequency. */
export function addFrequencyInterval(from: Date, frequency: ChoreFrequency): Date {
  const next = toUtcMidnight(from);
  switch (frequency) {
    case "DAILY":
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case "WEEKLY":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "BIWEEKLY":
      next.setUTCDate(next.getUTCDate() + 14);
      break;
    case "MONTHLY":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
  }
  return next;
}

/** Frequencies where "which weekday" is a meaningful, safe thing to pin down. */
export const WEEKDAY_SNAPPABLE_FREQUENCIES: ChoreFrequency[] = ["WEEKLY", "BIWEEKLY"];

/**
 * Moves `date` forward (never backward) to the next date whose weekday
 * matches `dueDayOfWeek` (0 = Sunday ... 6 = Saturday, JS convention). A
 * no-op when `dueDayOfWeek` is unset — most chores just use whatever
 * weekday the rotation naturally lands on.
 */
export function snapToDueDayOfWeek(date: Date, dueDayOfWeek: number | null): Date {
  if (dueDayOfWeek == null) return date;
  const snapped = toUtcMidnight(date);
  const diff = (dueDayOfWeek - snapped.getUTCDay() + 7) % 7;
  snapped.setUTCDate(snapped.getUTCDate() + diff);
  return snapped;
}

/**
 * The next due date this chore should be assigned for, given its last
 * assignment (or its own creation date, if it's never been assigned).
 *
 * dueDayOfWeek only applies to WEEKLY/BIWEEKLY chores. Applying it to a
 * DAILY chore would silently turn "every day" into "the same day every
 * week" — every occurrence would get pushed forward to the next matching
 * weekday, up to 6 days later than intended — and "which weekday" isn't a
 * meaningful constraint on a MONTHLY chore's own cadence either. The API
 * layer (app/api/chores/[choreId]/route.ts) also refuses to SET
 * dueDayOfWeek on a non-weekly-ish chore, but this function guards it too
 * in case a row ever has one set some other way (a frequency change after
 * dueDayOfWeek was already applied, for instance).
 */
export function computeNextDueDate(
  chore: { frequency: ChoreFrequency; dueDayOfWeek: number | null; createdAt: Date },
  lastDueDate: Date | null
): Date {
  const base = lastDueDate ? addFrequencyInterval(lastDueDate, chore.frequency) : toUtcMidnight(chore.createdAt);
  if (!WEEKDAY_SNAPPABLE_FREQUENCIES.includes(chore.frequency)) return base;
  return snapToDueDayOfWeek(base, chore.dueDayOfWeek);
}

/* ── Rotation eligibility ─────────────────────────────────────────────── */

/**
 * Which of `candidateUserIds` are NOT eligible for an assignment due on
 * `dueDate` — either no longer an ACTIVE member of the house, or covered by
 * a ChoreAbsence. Bulk (one query each) rather than per-candidate, mirroring
 * lib/authz.ts's bulkCanSeeExactListingLocation.
 */
export async function getIneligibleAssignees(
  houseId: string,
  candidateUserIds: string[],
  dueDate: Date
): Promise<Set<string>> {
  if (candidateUserIds.length === 0) return new Set();

  const [activeMembers, absences] = await Promise.all([
    prisma.houseMember.findMany({
      where: { houseId, userId: { in: candidateUserIds }, status: "ACTIVE" },
      select: { userId: true },
    }),
    prisma.choreAbsence.findMany({
      where: { houseId, userId: { in: candidateUserIds }, startDate: { lte: dueDate }, endDate: { gte: dueDate } },
      select: { userId: true },
    }),
  ]);

  const activeIds = new Set(activeMembers.map((m) => m.userId));
  const ineligible = new Set(candidateUserIds.filter((id) => !activeIds.has(id)));
  for (const absence of absences) ineligible.add(absence.userId);
  return ineligible;
}

export type AssigneePick = { userId: string; index: number } | null;

/**
 * Walks `rotationOrder` starting at (lastAssignedIndex + 1) % length,
 * skipping ineligible ids, and returns the first eligible one. Returns null
 * if nobody in the ring is eligible after a full wrap — a real coverage gap,
 * not something to paper over by reusing the last assignee.
 *
 * The fairness guarantee lives entirely in how the caller uses `index`:
 * lastAssignedIndex must be set to the RETURNED index (whoever actually got
 * it), never reset to the position that was skipped. Because the cursor only
 * ever advances through the fixed ring, whoever "absorbs" a skip differs
 * every time — nobody is structurally favored to double up.
 */
export function pickNextAssignee(
  rotationOrder: string[],
  lastAssignedIndex: number,
  ineligible: Set<string>
): AssigneePick {
  const length = rotationOrder.length;
  if (length === 0) return null;

  for (let step = 1; step <= length; step++) {
    const index = (lastAssignedIndex + step) % length;
    const userId = rotationOrder[index];
    if (!ineligible.has(userId)) return { userId, index };
  }
  return null;
}

/* ── Missed-assignment sweep (lazy, on read) ──────────────────────────── */

/**
 * Flips any PENDING assignment whose due date has fully passed to MISSED.
 * Called at the top of GET /api/chores, same lazy-sweep pattern as
 * lib/joinRequests.ts's 14-day expiry — nothing about what a resident sees
 * depends on this having run recently; it just keeps `status` queryable.
 */
export async function sweepMissedChores(houseId: string): Promise<void> {
  await prisma.choreAssignment.updateMany({
    where: {
      status: "PENDING",
      dueDate: { lt: todayUtcMidnight() },
      chore: { houseId },
    },
    data: { status: "MISSED" },
  });
}

/* ── Due-date suggestion (enhancement C) ─────────────────────────────── */

export type DueDateSuggestion = { dayOfWeek: number; sampleSize: number; matchingFraction: number } | null;

const MIN_SAMPLE_SIZE = 3;
const MIN_MATCHING_FRACTION = 0.5;

/**
 * Looks at when a chore's past occurrences were actually completed and
 * suggests a better default weekday — only a suggestion, never applied
 * without an explicit admin confirmation (PATCH /api/chores/[choreId]).
 * Requires a real majority pattern (>= 50% of a >= 3-occurrence sample) to
 * avoid suggesting off a single coincidence.
 */
export function computeDueDateSuggestion(completedDates: Date[]): DueDateSuggestion {
  if (completedDates.length < MIN_SAMPLE_SIZE) return null;

  const counts = new Array(7).fill(0);
  for (const date of completedDates) counts[date.getUTCDay()]++;

  const topDay = counts.reduce((best, count, day) => (count > counts[best] ? day : best), 0);
  const matchingFraction = counts[topDay] / completedDates.length;

  if (matchingFraction < MIN_MATCHING_FRACTION) return null;
  return { dayOfWeek: topDay, sampleSize: completedDates.length, matchingFraction };
}

/* ── Parent/subtask completion ─────────────────────────────────────────── */

/**
 * True once every subtask of a split assignment is COMPLETED. An assignment
 * with no subtasks is unaffected — this only matters once split.
 */
export async function areAllSubtasksComplete(assignmentId: string): Promise<boolean> {
  const subtasks = await prisma.choreSubtask.findMany({
    where: { assignmentId },
    select: { status: true },
  });
  if (subtasks.length === 0) return true;
  return subtasks.every((s) => s.status === "COMPLETED");
}
