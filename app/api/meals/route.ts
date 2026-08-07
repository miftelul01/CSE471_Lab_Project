import { badRequest, fromPostgrestError, notImplemented, ok, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** M2.3 Meal Attendance & Auto-Quantity Adjustment — Md. Mahidul Alam Araf. */

// Uses cookies() for the session, so it can never be statically prerendered.
export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before tracking meals.");

  const params = new URL(req.url).searchParams;
  const from = params.get("from") ?? new Date().toISOString().slice(0, 10);

  const supabase = createClient();
  const { data, error } = await supabase
    .from("meals")
    .select("*, meal_attendance(*, profiles(full_name))")
    .eq("house_id", houseId)
    .gte("meal_date", from)
    .order("meal_date", { ascending: true });

  if (error) return fromPostgrestError(error);
  return ok({ meals: data });
});

/**
 * TODO (M2.3): create a meal slot (house_id, meal_date, meal_type). The unique
 * index on those three columns makes this safely re-runnable — upsert rather
 * than insert and you can call it every time the page loads.
 */
export const POST = withUser(async () => notImplemented("Creating meal slots"));

/**
 * TODO (M2.3): toggle attendance.
 *  1. Upsert meal_attendance on (meal_id, user_id) with ATTENDING/SKIPPING.
 *  2. Do NOT touch meals.headcount — the recalc_meal_headcount trigger owns it.
 *  3. Then apply the cost adjustment against M2.1's expense_shares.
 */
export const PATCH = withUser(async () => notImplemented("Toggling meal attendance"));
