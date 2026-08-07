import { badRequest, notImplemented, ok, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** M2.3 Meal Attendance & Auto-Quantity Adjustment — Md. Mahidul Alam Araf. */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before tracking meals.");

  const from = new URL(req.url).searchParams.get("from");
  const meals = await prisma.meal.findMany({
    where: { houseId, mealDate: { gte: from ? new Date(from) : new Date() } },
    include: { attendance: { include: { user: { select: { id: true, name: true } } } } },
    orderBy: { mealDate: "asc" },
  });
  return ok({ meals });
});

/** TODO (M2.3): upsert a meal slot on (houseId, mealDate, mealType). */
export const POST = withUser(async () => notImplemented("Creating meal slots"));

/**
 * TODO (M2.3): toggle attendance.
 *  1. Upsert MealAttendance on (mealId, userId).
 *  2. Do NOT touch meal.headcount — the recalc_meal_headcount trigger owns it,
 *     which is why the cook's quantity can never drift from the toggles.
 *  3. Apply the cost adjustment against M2.1's ExpenseShare rows.
 *  4. Respect meal.locksAt: RLS used to reject late changes, so that check is
 *     now yours to make.
 */
export const PATCH = withUser(async () => notImplemented("Toggling meal attendance"));
