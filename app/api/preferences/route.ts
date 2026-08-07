import { badRequest, missingFields, ok, readJson, withUser } from "@/lib/api";
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
  if (Number(body.budgetMin) > Number(body.budgetMax)) {
    return badRequest("budgetMin cannot exceed budgetMax");
  }

  const data = {
    budgetMin: Number(body.budgetMin),
    budgetMax: Number(body.budgetMax),
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
