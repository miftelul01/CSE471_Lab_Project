import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { isHouseAdmin } from "@/lib/authz";
import { toUtcMidnight, validateAbsenceRange } from "@/lib/chores";
import { prisma } from "@/lib/prisma";

/**
 * M3.4 — absence handling (spec requirement 2). A resident marks themselves
 * unavailable for a stretch; the rotation cron skips them for any due date
 * inside the range without moving lastAssignedIndex backward.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house first.");

  const absences = await prisma.choreAbsence.findMany({
    where: { houseId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { startDate: "desc" },
  });

  // The FACT of an absence (who, which dates) is fair for every housemate
  // to see — that's what makes the rotation's fairness legible, and it's
  // the whole point of exposing this list at all (see lib/chores.ts's
  // MAX_ABSENCE_DAYS comment on the earlier version silently having no
  // visibility at all). The free-text `reason`, though, can carry genuinely
  // private detail ("hospital," a family situation) that a housemate has no
  // operational need to know — only the absentee themselves or a house
  // admin sees it; everyone else gets the dates with the reason stripped.
  const admin = await isHouseAdmin(user.id, houseId);
  const visible = absences.map((a) => ({
    ...a,
    reason: a.userId === user.id || admin ? a.reason : null,
  }));

  return ok({ absences: visible });
});

export const POST = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house first.");

  const body = await readJson<{ startDate: string; endDate: string; reason?: string }>(req);
  const startDate = body?.startDate ? toUtcMidnight(new Date(body.startDate)) : null;
  const endDate = body?.endDate ? toUtcMidnight(new Date(body.endDate)) : null;
  if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
    return badRequest("startDate and endDate must be valid dates.");
  }
  const rangeError = validateAbsenceRange(startDate, endDate);
  if (rangeError) return badRequest(rangeError);

  const absence = await prisma.choreAbsence.create({
    data: { houseId, userId: user.id, startDate, endDate, reason: body?.reason?.trim() || null },
  });
  return ok(absence, 201);
});
