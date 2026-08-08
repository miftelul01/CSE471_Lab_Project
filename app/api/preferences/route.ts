import { badRequest, missingFields, ok, readJson, withUser } from "@/lib/api";
import { CLEANLINESS_LEVELS, SLEEP_SCHEDULES } from "@/lib/listings";
import { prisma } from "@/lib/prisma";
import type { CleanlinessLevel, SleepSchedule } from "@prisma/client";

/**
 * M1.2 — lifestyle preference profile (Mahia Tanzin).
 *
 * Keyed on the session user, so there is no userId parameter anywhere. The
 * "own preferences" RLS policy used to guarantee that; now it's guaranteed by
 * never reading an id from the request.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const preference = await prisma.preference.findUnique({ where: { userId: user.id } });
  return ok({ preference });
});

type PreferenceBody = {
  budgetMin: number;
  budgetMax: number;
  sleepSchedule: SleepSchedule;
  cleanliness: CleanlinessLevel;
  smokingOk?: boolean;
  petsOk?: boolean;
  preferredArea?: string | null;
};

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<PreferenceBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["budgetMin", "budgetMax", "sleepSchedule", "cleanliness"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  const budgetMin = Number(body.budgetMin);
  const budgetMax = Number(body.budgetMax);
  if (!Number.isFinite(budgetMin) || budgetMin < 0) {
    return badRequest("budgetMin must be a number of 0 or more.");
  }
  if (!Number.isFinite(budgetMax) || budgetMax < 0) {
    return badRequest("budgetMax must be a number of 0 or more.");
  }
  if (budgetMin > budgetMax) {
    return badRequest("budgetMin cannot exceed budgetMax");
  }
  // An unknown enum value reaches Postgres as an invalid cast and 500s, so
  // check it here and answer with a useful 400 instead (mirrors the same
  // guard on room type in app/api/listings/route.ts).
  if (!SLEEP_SCHEDULES.includes(body.sleepSchedule)) {
    return badRequest(`sleepSchedule must be one of: ${SLEEP_SCHEDULES.join(", ")}`);
  }
  if (!CLEANLINESS_LEVELS.includes(body.cleanliness)) {
    return badRequest(`cleanliness must be one of: ${CLEANLINESS_LEVELS.join(", ")}`);
  }

  const data = {
    budgetMin,
    budgetMax,
    sleepSchedule: body.sleepSchedule,
    cleanliness: body.cleanliness,
    smokingOk: Boolean(body.smokingOk),
    petsOk: Boolean(body.petsOk),
    preferredArea: body.preferredArea || null,
  };

  const preference = await prisma.preference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  return ok(preference);
});
