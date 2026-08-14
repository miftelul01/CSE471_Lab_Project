import { badRequest, forbidden, missingFields, ok, readJson, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { assertCanManageHouse, assertHouseMember } from "@/lib/authz";

import {
  changeMealAttendance,
  loadMealAttendancePageData,
  saveMealSlot,
} from "@/Araf/M2.3-MealAttendance/mealAttendance";
import type { AttendanceStatus, MealType } from "@prisma/client";

/** M2.3 Meal Attendance & Auto-Quantity Adjustment — Md. Mahidul Alam Araf. */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before tracking meals.");

  const from = new URL(req.url).searchParams.get("from");
  const data = await loadMealAttendancePageData(user.id, houseId, from);
  return ok(data);
});

type MealSlotBody = {
  mealDate: string;
  mealType: MealType;
  costPerHead?: number | string | null;
  locksAt?: string | null;
  menuProposalId?: string | null;
};

export const POST = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before tracking meals.");

  await assertCanManageHouse(user, houseId);

  const body = await readJson<MealSlotBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["mealDate", "mealType"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  const meal = await saveMealSlot(user.id, houseId, body);
  return ok(meal, 201);
});

type MealAttendanceBody = {
  mealId: string;
  /** Left loose on purpose: changeMealAttendance rejects anything unknown. */
  status?: AttendanceStatus;
};

export const PATCH = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before tracking meals.");

  await assertHouseMember(user, houseId);

  const body = await readJson<MealAttendanceBody>(req);
  if (!body?.mealId) return badRequest("mealId is required");

  const meal = await changeMealAttendance(user.id, houseId, body.mealId, body.status);
  return ok(meal);
});
