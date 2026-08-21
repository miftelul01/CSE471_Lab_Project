import { badRequest, notFound, ok, readJson, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { assertCanCloseMenuVoting } from "@/lib/authz";
import { EMERGENCY_REVOTE_HOURS, dateForDay, dhakaToday, mondayOf } from "@/lib/menu";
import { prisma } from "@/lib/prisma";

/**
 * M2.2 — Emergency Daily Re-Vote Procedure (Mahia Tanzin). The house
 * admin/cook flags a decided-but-not-yet-happened day as having a missing
 * key ingredient, triggering a 3h fast re-vote among that day's original
 * non-winning candidates — see lib/menu.ts advanceDailyVote's
 * EMERGENCY_REVOTE branch for the resolution.
 */

export const dynamic = "force-dynamic";

type EmergencyBody = { weekStartDate: string; dayOfWeek: number; reason: string };

export const POST = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before managing menu voting.");
  await assertCanCloseMenuVoting(user, houseId);

  const body = await readJson<EmergencyBody>(req);
  if (!body?.weekStartDate || body.dayOfWeek == null || !body.reason?.trim()) {
    return badRequest("weekStartDate, dayOfWeek and reason are required");
  }
  const weekStartDate = mondayOf(new Date(body.weekStartDate));

  const result = await prisma.dailyMealResult.findUnique({
    where: { houseId_weekStartDate_dayOfWeek: { houseId, weekStartDate, dayOfWeek: body.dayOfWeek } },
  });
  if (!result) return notFound("No decided vote for that day yet.");
  if (result.status !== "DECIDED") {
    return badRequest(`Only a decided day can be flagged for an emergency re-vote (status: ${result.status}).`);
  }

  const mealDate = dateForDay(weekStartDate, body.dayOfWeek);
  if (mealDate.getTime() < dhakaToday().getTime()) {
    return badRequest("That day has already happened — an emergency re-vote can only be triggered ahead of time.");
  }

  const updated = await prisma.dailyMealResult.update({
    where: { id: result.id },
    data: {
      status: "EMERGENCY_REVOTE",
      roundDeadline: new Date(Date.now() + EMERGENCY_REVOTE_HOURS * 3_600_000),
      emergencyReason: body.reason.trim(),
    },
  });

  return ok(updated);
});
