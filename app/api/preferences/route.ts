import { badRequest, fromPostgrestError, missingFields, ok, readJson, withUser } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import type { CleanlinessLevel, SleepSchedule } from "@/lib/supabase/types";

/**
 * M1.2 — lifestyle preference profile (Mahia Tanzin).
 *
 * Note there is no `userId` parameter anywhere: the row is keyed on the
 * session user, and the "own preferences" RLS policy in migration 0003 makes
 * it impossible to read or write anyone else's even if you tried.
 */

// Uses cookies() for the session, so it can never be statically prerendered.
export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return fromPostgrestError(error);
  return ok({ preference: data });
});

type PreferenceBody = {
  budget_min: number;
  budget_max: number;
  sleep_schedule: SleepSchedule;
  cleanliness: CleanlinessLevel;
  smoking_ok?: boolean;
  pets_ok?: boolean;
  preferred_area?: string | null;
};

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<PreferenceBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, [
    "budget_min",
    "budget_max",
    "sleep_schedule",
    "cleanliness",
  ]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  if (Number(body.budget_min) > Number(body.budget_max)) {
    return badRequest("budget_min cannot exceed budget_max");
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("preferences")
    .upsert(
      {
        user_id: user.id,
        budget_min: Number(body.budget_min),
        budget_max: Number(body.budget_max),
        sleep_schedule: body.sleep_schedule,
        cleanliness: body.cleanliness,
        smoking_ok: Boolean(body.smoking_ok),
        pets_ok: Boolean(body.pets_ok),
        preferred_area: body.preferred_area || null,
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error) return fromPostgrestError(error);
  return ok(data);
});
