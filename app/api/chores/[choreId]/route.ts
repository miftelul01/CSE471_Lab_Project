import { badRequest, notFound, ok, readJson, withUser } from "@/lib/api";
import { assertCanManageHouse } from "@/lib/authz";
import { WEEKDAY_SNAPPABLE_FREQUENCIES } from "@/lib/chores";
import { prisma } from "@/lib/prisma";

/**
 * M3.4 — admin edits to an existing chore: rotation order, active flag, and
 * the confirmed due-weekday override (enhancement C's applied effect — the
 * suggestion itself is GET /api/chores/[choreId]/due-date-suggestion,
 * computed live, never applied without this explicit call).
 */

export const dynamic = "force-dynamic";

export const PATCH = withUser(async (user, req: Request, { params }: { params: { choreId: string } }) => {
  const chore = await prisma.chore.findUnique({
    where: { id: params.choreId },
    select: { houseId: true, frequency: true },
  });
  if (!chore) return notFound("No such chore");
  await assertCanManageHouse(user, chore.houseId);

  const body = await readJson<{ rotationOrder?: string[]; isActive?: boolean; dueDayOfWeek?: number | null }>(req);
  if (!body) return badRequest("Invalid JSON body");

  const data: { rotationOrder?: string[]; isActive?: boolean; dueDayOfWeek?: number | null } = {};

  if (body.rotationOrder !== undefined) {
    if (body.rotationOrder.length === 0) return badRequest("rotationOrder can't be empty.");
    const validIds = new Set(
      (
        await prisma.houseMember.findMany({
          where: { houseId: chore.houseId, userId: { in: body.rotationOrder }, status: "ACTIVE" },
          select: { userId: true },
        })
      ).map((m) => m.userId)
    );
    if (body.rotationOrder.some((id) => !validIds.has(id))) {
      return badRequest("rotationOrder includes someone who isn't an active member of this house.");
    }
    data.rotationOrder = body.rotationOrder;
  }

  if (body.isActive !== undefined) data.isActive = body.isActive;

  if (body.dueDayOfWeek !== undefined) {
    if (body.dueDayOfWeek !== null && (body.dueDayOfWeek < 0 || body.dueDayOfWeek > 6)) {
      return badRequest("dueDayOfWeek must be 0-6 (Sunday-Saturday) or null.");
    }
    // A weekday pin only means something for a chore that recurs weekly —
    // applying it to a DAILY chore would silently turn "every day" into
    // "the same day every week", and it's meaningless for MONTHLY.
    if (body.dueDayOfWeek !== null && !WEEKDAY_SNAPPABLE_FREQUENCIES.includes(chore.frequency)) {
      return badRequest("dueDayOfWeek only applies to WEEKLY or BIWEEKLY chores.");
    }
    data.dueDayOfWeek = body.dueDayOfWeek;
  }

  const updated = await prisma.chore.update({ where: { id: params.choreId }, data });
  return ok(updated);
});
