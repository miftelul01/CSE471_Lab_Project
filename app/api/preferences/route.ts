import { badRequest, missingFields, ok, readJson, withUser } from "@/lib/api";
import { CLEANLINESS_MAX, CLEANLINESS_MIN, SLEEP_SCHEDULES } from "@/lib/listings";
import { prisma } from "@/lib/prisma";
import type { GuestPolicy, PreferenceWeight, SleepSchedule } from "@prisma/client";

/**
 * M1.2 — lifestyle preference profile & custom weighting (Mahia Tanzin).
 *
 * Keyed on the session user, so there is no userId parameter anywhere. The
 * "own preferences" RLS policy used to guarantee that; now it's guaranteed by
 * never reading an id from the request.
 */

export const dynamic = "force-dynamic";

const GUEST_POLICIES: GuestPolicy[] = ["RARELY", "OCCASIONALLY", "FREQUENTLY"];
const WEIGHTS: PreferenceWeight[] = ["MUST_HAVE", "HIGH", "MEDIUM", "LOW"];
const NOISE_MIN = 1;
const NOISE_MAX = 5;

export const GET = withUser(async (user) => {
  const preference = await prisma.preference.findUnique({ where: { userId: user.id } });
  return ok({ preference });
});

type PreferenceBody = {
  budgetMin: number;
  budgetMax: number;
  sleepSchedule: SleepSchedule;
  cleanlinessLevel: number;
  noiseTolerance: number;
  guestPolicy: GuestPolicy;
  smokingOk?: boolean;
  petsOk?: boolean;
  preferredArea?: string | null;
  budgetWeight?: PreferenceWeight;
  sleepWeight?: PreferenceWeight;
  cleanlinessWeight?: PreferenceWeight;
  noiseWeight?: PreferenceWeight;
  guestWeight?: PreferenceWeight;
  smokingWeight?: PreferenceWeight;
  petsWeight?: PreferenceWeight;
};

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<PreferenceBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, [
    "budgetMin",
    "budgetMax",
    "sleepSchedule",
    "cleanlinessLevel",
    "noiseTolerance",
    "guestPolicy",
  ]);
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
  // Unknown enum/out-of-range values reach Postgres as an invalid cast or a
  // CHECK-constraint violation and 500, so check them here (mirrors the same
  // guard on room type in app/api/listings/route.ts).
  if (!SLEEP_SCHEDULES.includes(body.sleepSchedule)) {
    return badRequest(`sleepSchedule must be one of: ${SLEEP_SCHEDULES.join(", ")}`);
  }
  if (!GUEST_POLICIES.includes(body.guestPolicy)) {
    return badRequest(`guestPolicy must be one of: ${GUEST_POLICIES.join(", ")}`);
  }
  const cleanlinessLevel = Number(body.cleanlinessLevel);
  if (!Number.isInteger(cleanlinessLevel) || cleanlinessLevel < CLEANLINESS_MIN || cleanlinessLevel > CLEANLINESS_MAX) {
    return badRequest(`cleanlinessLevel must be a whole number from ${CLEANLINESS_MIN} to ${CLEANLINESS_MAX}.`);
  }
  const noiseTolerance = Number(body.noiseTolerance);
  if (!Number.isInteger(noiseTolerance) || noiseTolerance < NOISE_MIN || noiseTolerance > NOISE_MAX) {
    return badRequest(`noiseTolerance must be a whole number from ${NOISE_MIN} to ${NOISE_MAX}.`);
  }

  const weightFields: [keyof PreferenceBody, string][] = [
    ["budgetWeight", "budgetWeight"],
    ["sleepWeight", "sleepWeight"],
    ["cleanlinessWeight", "cleanlinessWeight"],
    ["noiseWeight", "noiseWeight"],
    ["guestWeight", "guestWeight"],
    ["smokingWeight", "smokingWeight"],
    ["petsWeight", "petsWeight"],
  ];
  for (const [key, label] of weightFields) {
    const value = body[key];
    if (value !== undefined && !WEIGHTS.includes(value as PreferenceWeight)) {
      return badRequest(`${label} must be one of: ${WEIGHTS.join(", ")}`);
    }
  }

  const data = {
    budgetMin,
    budgetMax,
    sleepSchedule: body.sleepSchedule,
    cleanlinessLevel,
    noiseTolerance,
    guestPolicy: body.guestPolicy,
    smokingOk: Boolean(body.smokingOk),
    petsOk: Boolean(body.petsOk),
    preferredArea: body.preferredArea || null,
    budgetWeight: body.budgetWeight ?? "MEDIUM",
    sleepWeight: body.sleepWeight ?? "MEDIUM",
    cleanlinessWeight: body.cleanlinessWeight ?? "MEDIUM",
    noiseWeight: body.noiseWeight ?? "MEDIUM",
    guestWeight: body.guestWeight ?? "MEDIUM",
    smokingWeight: body.smokingWeight ?? "MEDIUM",
    petsWeight: body.petsWeight ?? "MEDIUM",
  };

  const preference = await prisma.preference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  return ok(preference);
});
