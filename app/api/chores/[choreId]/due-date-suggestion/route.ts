import { notFound, ok, withUser } from "@/lib/api";
import { assertCanManageHouse } from "@/lib/authz";
import { computeDueDateSuggestion, WEEKDAY_SNAPPABLE_FREQUENCIES } from "@/lib/chores";
import { prisma } from "@/lib/prisma";

/**
 * M3.4 enhancement C — recurring-pattern due-date suggestion. House-admin
 * only, read-only, computed live from completion history — never applied
 * without an explicit PATCH /api/chores/[choreId] call confirming it.
 */

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const GET = withUser(async (user, _req: Request, { params }: { params: { choreId: string } }) => {
  const chore = await prisma.chore.findUnique({
    where: { id: params.choreId },
    select: { houseId: true, frequency: true },
  });
  if (!chore) return notFound("No such chore");
  await assertCanManageHouse(user, chore.houseId);

  // A weekday pattern is only a meaningful, applicable suggestion for a
  // WEEKLY/BIWEEKLY chore (see PATCH /api/chores/[choreId]'s matching
  // guard) — don't even compute one for DAILY/MONTHLY.
  if (!WEEKDAY_SNAPPABLE_FREQUENCIES.includes(chore.frequency)) {
    return ok({ suggestion: null });
  }

  const completed = await prisma.choreAssignment.findMany({
    where: { choreId: params.choreId, status: "COMPLETED", completedAt: { not: null } },
    select: { completedAt: true },
    orderBy: { completedAt: "desc" },
    take: 20,
  });

  const suggestion = computeDueDateSuggestion(completed.map((c) => c.completedAt!));
  if (!suggestion) return ok({ suggestion: null });

  return ok({ suggestion: { ...suggestion, dayName: DAY_NAMES[suggestion.dayOfWeek] } });
});
