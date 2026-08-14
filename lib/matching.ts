/**
 * Smart Roommate & House Matching — matching engine, v2.
 *
 * Three comparison shapes, one shared scoring core:
 *  1. computeCompatibilityScore   — User <-> Listing (static room attributes,
 *     or a live aggregate of the house's current residents — see
 *     aggregateHousePreferences).
 *  2. computeUserCompatibilityScore — User <-> User, for direct roommate
 *     matching independent of any specific listing.
 *  3. runStableMatching           — unchanged Hospital/Residents algorithm;
 *     it only ever consumes the numeric score, so it's agnostic to how that
 *     score was computed.
 *
 * Custom Preference Weighting: each resident assigns MUST_HAVE / HIGH /
 * MEDIUM / LOW importance to budget, sleep, cleanliness, noise, guests,
 * smoking and pets. MUST_HAVE is not just a heavier multiplier — a hard
 * mismatch on a MUST_HAVE factor caps the whole score low ("heavy penalty
 * for hard dealbreakers"), the rest scale a factor's base weight up or down
 * before the weighted average is renormalized.
 *
 * Match Score Transparency Breakdown: every score comes back with a
 * per-factor breakdown (and a one-line summary), not just a number — see
 * ScoreResult.
 */

import type { GuestPolicy, PreferenceWeight, SleepSchedule } from "@prisma/client";

export type { SleepSchedule, GuestPolicy, PreferenceWeight };

export interface PreferenceWeights {
  budgetWeight: PreferenceWeight;
  sleepWeight: PreferenceWeight;
  cleanlinessWeight: PreferenceWeight;
  noiseWeight: PreferenceWeight;
  guestWeight: PreferenceWeight;
  smokingWeight: PreferenceWeight;
  petsWeight: PreferenceWeight;
}

export interface ResidentPreference extends PreferenceWeights {
  userId: string;
  budgetMin: number;
  budgetMax: number;
  sleepSchedule: SleepSchedule;
  /** 1 (relaxed) - 5 (very tidy). */
  cleanlinessLevel: number;
  /** 1 (needs quiet) - 5 (tolerates a lot of noise). */
  noiseTolerance: number;
  guestPolicy: GuestPolicy;
  smokingOk: boolean;
  petsOk: boolean;
  preferredArea?: string | null;
  /** Cumulative post-move-in-complaint penalty (0-50). Dampens the final score. */
  matchRatingPenalty?: number;
}

export interface ListingInput {
  listingId: string;
  rent: number;
  area: string;
  capacity: number;
  // Static room attributes (landlord's stated house rules), OR a live
  // aggregate of the house's current residents when the house has any — see
  // aggregateHousePreferences. Undefined fields are excluded from scoring
  // rather than treated as a neutral 0.5, so a plain per-listing comparison
  // (no noise/guest data available) doesn't get diluted by factors nobody
  // actually stated an opinion on.
  sleepSchedule?: SleepSchedule;
  cleanlinessLevel?: number;
  noiseTolerance?: number;
  guestPolicy?: GuestPolicy;
  allowsSmoking?: boolean;
  allowsPets?: boolean;
}

export interface ScoreBreakdownItem {
  factor: "budget" | "area" | "sleep" | "cleanliness" | "noise" | "guests" | "smoking" | "pets";
  label: string;
  score: number;
  weight: number;
  dealbreaker: boolean;
}

export interface ScoreResult {
  score: number;
  breakdown: ScoreBreakdownItem[];
  /** e.g. "High alignment on Budget & Sleep Schedule; minor gap on Cleanliness." */
  summary: string;
}

const SLEEP_COMPATIBILITY: Record<SleepSchedule, Record<SleepSchedule, number>> = {
  EARLY_BIRD: { EARLY_BIRD: 1, FLEXIBLE: 0.75, NIGHT_OWL: 0.2 },
  NIGHT_OWL: { NIGHT_OWL: 1, FLEXIBLE: 0.75, EARLY_BIRD: 0.2 },
  FLEXIBLE: { EARLY_BIRD: 0.75, NIGHT_OWL: 0.75, FLEXIBLE: 1 },
};

const GUEST_POLICY_COMPATIBILITY: Record<GuestPolicy, Record<GuestPolicy, number>> = {
  RARELY: { RARELY: 1, OCCASIONALLY: 0.7, FREQUENTLY: 0.25 },
  OCCASIONALLY: { RARELY: 0.7, OCCASIONALLY: 1, FREQUENTLY: 0.7 },
  FREQUENTLY: { RARELY: 0.25, OCCASIONALLY: 0.7, FREQUENTLY: 1 },
};

// Base weights, sum to 1. Scaled per-factor by each resident's declared
// importance, then renormalized (area and matchRatingPenalty aren't
// individually weightable — area has no per-factor weight in the schema,
// and rating penalty is a flat multiplier applied after).
const BASE_WEIGHT = {
  budget: 0.22,
  area: 0.13,
  sleep: 0.15,
  cleanliness: 0.15,
  noise: 0.1,
  guests: 0.07,
  smoking: 0.09,
  pets: 0.09,
} as const;

/** HIGH/MEDIUM/LOW scale a factor's weight; MUST_HAVE additionally triggers the hard-penalty path below. */
function weightMultiplier(weight: PreferenceWeight): number {
  switch (weight) {
    case "MUST_HAVE":
      return 4;
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 1;
  }
}

/** A MUST_HAVE factor scoring below this is a hard mismatch, not just "imperfect". */
const HARD_MISMATCH_THRESHOLD = 0.5;
/** Final score ceiling when a MUST_HAVE dealbreaker is hit — "heavy penalty", not a soft average. */
const DEALBREAKER_CAP = 0.15;

function budgetScore(min: number, max: number, rent: number): number {
  if (rent >= min && rent <= max) return 1;
  const distance = rent < min ? min - rent : rent - max;
  const range = Math.max(max - min, 1);
  return Math.max(0, 1 - distance / range);
}

function budgetOverlapScore(aMin: number, aMax: number, bMin: number, bMax: number): number {
  const overlapStart = Math.max(aMin, bMin);
  const overlapEnd = Math.min(aMax, bMax);
  const avgRange = Math.max(((aMax - aMin) + (bMax - bMin)) / 2, 1);
  if (overlapEnd >= overlapStart) {
    return Math.min(1, (overlapEnd - overlapStart) / avgRange);
  }
  const gap = overlapStart - overlapEnd;
  return Math.max(0, 1 - gap / avgRange);
}

function areaScore(preferredArea: string | null | undefined, otherArea: string | null | undefined): number {
  if (!preferredArea || !otherArea) return 0.5;
  return preferredArea.toLowerCase() === otherArea.toLowerCase() ? 1 : 0.3;
}

function levelScore(a: number, b: number, scaleMax = 4): number {
  return Math.max(0, 1 - Math.abs(a - b) / scaleMax);
}

function booleanScore(residentOk: boolean, otherAllows: boolean | undefined): number {
  if (otherAllows === undefined) return 0.5;
  return residentOk === otherAllows ? 1 : 0.3;
}

/** Shared weighted-average + MUST_HAVE-dealbreaker core, used by both comparison shapes. */
function combine(
  parts: { factor: ScoreBreakdownItem["factor"]; label: string; score: number; base: number; weight: PreferenceWeight; included: boolean }[],
  matchRatingPenalty: number
): ScoreResult {
  let weightedSum = 0;
  let weightTotal = 0;
  let dealbreakerHit = false;
  const breakdown: ScoreBreakdownItem[] = [];

  for (const part of parts) {
    if (!part.included) continue;
    const multiplier = weightMultiplier(part.weight);
    const effectiveWeight = part.base * multiplier;
    weightedSum += part.score * effectiveWeight;
    weightTotal += effectiveWeight;

    const isDealbreaker = part.weight === "MUST_HAVE" && part.score < HARD_MISMATCH_THRESHOLD;
    if (isDealbreaker) dealbreakerHit = true;

    breakdown.push({
      factor: part.factor,
      label: part.label,
      score: Math.round(part.score * 1000) / 1000,
      weight: effectiveWeight,
      dealbreaker: isDealbreaker,
    });
  }

  let total = weightTotal > 0 ? weightedSum / weightTotal : 0;
  if (dealbreakerHit) total = Math.min(total, DEALBREAKER_CAP);
  total *= Math.max(0, 1 - matchRatingPenalty / 100);

  return {
    score: Math.round(total * 1000) / 1000,
    breakdown,
    summary: summarizeBreakdown(breakdown, dealbreakerHit),
  };
}

function summarizeBreakdown(breakdown: ScoreBreakdownItem[], dealbreakerHit: boolean): string {
  if (breakdown.length === 0) return "Not enough information to compare yet.";
  const dealbreaker = breakdown.find((b) => b.dealbreaker);
  if (dealbreakerHit && dealbreaker) {
    return `Dealbreaker: ${dealbreaker.label.toLowerCase()} is a hard mismatch on a must-have.`;
  }
  const sorted = [...breakdown].sort((a, b) => b.score - a.score);
  const strong = sorted.filter((b) => b.score >= 0.75).slice(0, 2);
  const weak = sorted.filter((b) => b.score < 0.5).slice(0, 1);
  const parts: string[] = [];
  if (strong.length > 0) {
    parts.push(`High alignment on ${strong.map((b) => b.label).join(" & ")}`);
  }
  if (weak.length > 0) {
    parts.push(`minor gap on ${weak.map((b) => b.label).join(", ")}`);
  }
  if (parts.length === 0) return "A reasonable, middle-of-the-road fit across the board.";
  return parts.join("; ") + ".";
}

/** User <-> Listing (or a house's live aggregate — see aggregateHousePreferences). */
export function computeCompatibilityScore(pref: ResidentPreference, listing: ListingInput): ScoreResult {
  const parts = [
    {
      factor: "budget" as const,
      label: "Budget",
      score: budgetScore(pref.budgetMin, pref.budgetMax, listing.rent),
      base: BASE_WEIGHT.budget,
      weight: pref.budgetWeight,
      included: true,
    },
    {
      factor: "area" as const,
      label: "Area",
      score: areaScore(pref.preferredArea, listing.area),
      base: BASE_WEIGHT.area,
      weight: "MEDIUM" as PreferenceWeight,
      included: true,
    },
    {
      factor: "sleep" as const,
      label: "Sleep schedule",
      score: listing.sleepSchedule ? SLEEP_COMPATIBILITY[pref.sleepSchedule][listing.sleepSchedule] : 0.5,
      base: BASE_WEIGHT.sleep,
      weight: pref.sleepWeight,
      included: true,
    },
    {
      factor: "cleanliness" as const,
      label: "Cleanliness",
      score: listing.cleanlinessLevel !== undefined ? levelScore(pref.cleanlinessLevel, listing.cleanlinessLevel) : 0.5,
      base: BASE_WEIGHT.cleanliness,
      weight: pref.cleanlinessWeight,
      included: true,
    },
    {
      factor: "noise" as const,
      label: "Noise tolerance",
      score: listing.noiseTolerance !== undefined ? levelScore(pref.noiseTolerance, listing.noiseTolerance) : 0.5,
      base: BASE_WEIGHT.noise,
      weight: pref.noiseWeight,
      // No per-listing noise data unless this is a house-aggregate comparison.
      included: listing.noiseTolerance !== undefined,
    },
    {
      factor: "guests" as const,
      label: "Guest policy",
      score: listing.guestPolicy ? GUEST_POLICY_COMPATIBILITY[pref.guestPolicy][listing.guestPolicy] : 0.5,
      base: BASE_WEIGHT.guests,
      weight: pref.guestWeight,
      included: listing.guestPolicy !== undefined,
    },
    {
      factor: "smoking" as const,
      label: "Smoking",
      score: booleanScore(pref.smokingOk, listing.allowsSmoking),
      base: BASE_WEIGHT.smoking,
      weight: pref.smokingWeight,
      included: true,
    },
    {
      factor: "pets" as const,
      label: "Pets",
      score: booleanScore(pref.petsOk, listing.allowsPets),
      base: BASE_WEIGHT.pets,
      weight: pref.petsWeight,
      included: true,
    },
  ];

  return combine(parts, pref.matchRatingPenalty ?? 0);
}

/** User <-> User — direct roommate matching, independent of any listing. */
export function computeUserCompatibilityScore(a: ResidentPreference, b: ResidentPreference): ScoreResult {
  const avgWeight = (wa: PreferenceWeight, wb: PreferenceWeight): PreferenceWeight => {
    // Either side calling something MUST_HAVE keeps it a dealbreaker for the pair.
    if (wa === "MUST_HAVE" || wb === "MUST_HAVE") return "MUST_HAVE";
    const order: PreferenceWeight[] = ["LOW", "MEDIUM", "HIGH"];
    const avgIdx = Math.round((order.indexOf(wa) + order.indexOf(wb)) / 2);
    return order[avgIdx];
  };

  const parts = [
    {
      factor: "budget" as const,
      label: "Budget",
      score: budgetOverlapScore(a.budgetMin, a.budgetMax, b.budgetMin, b.budgetMax),
      base: BASE_WEIGHT.budget,
      weight: avgWeight(a.budgetWeight, b.budgetWeight),
      included: true,
    },
    {
      factor: "area" as const,
      label: "Area",
      score: areaScore(a.preferredArea, b.preferredArea),
      base: BASE_WEIGHT.area,
      weight: "MEDIUM" as PreferenceWeight,
      included: true,
    },
    {
      factor: "sleep" as const,
      label: "Sleep schedule",
      score: SLEEP_COMPATIBILITY[a.sleepSchedule][b.sleepSchedule],
      base: BASE_WEIGHT.sleep,
      weight: avgWeight(a.sleepWeight, b.sleepWeight),
      included: true,
    },
    {
      factor: "cleanliness" as const,
      label: "Cleanliness",
      score: levelScore(a.cleanlinessLevel, b.cleanlinessLevel),
      base: BASE_WEIGHT.cleanliness,
      weight: avgWeight(a.cleanlinessWeight, b.cleanlinessWeight),
      included: true,
    },
    {
      factor: "noise" as const,
      label: "Noise tolerance",
      score: levelScore(a.noiseTolerance, b.noiseTolerance),
      base: BASE_WEIGHT.noise,
      weight: avgWeight(a.noiseWeight, b.noiseWeight),
      included: true,
    },
    {
      factor: "guests" as const,
      label: "Guest policy",
      score: GUEST_POLICY_COMPATIBILITY[a.guestPolicy][b.guestPolicy],
      base: BASE_WEIGHT.guests,
      weight: avgWeight(a.guestWeight, b.guestWeight),
      included: true,
    },
    {
      factor: "smoking" as const,
      label: "Smoking",
      score: a.smokingOk === b.smokingOk ? 1 : 0.3,
      base: BASE_WEIGHT.smoking,
      weight: avgWeight(a.smokingWeight, b.smokingWeight),
      included: true,
    },
    {
      factor: "pets" as const,
      label: "Pets",
      score: a.petsOk === b.petsOk ? 1 : 0.3,
      base: BASE_WEIGHT.pets,
      weight: avgWeight(a.petsWeight, b.petsWeight),
      included: true,
    },
  ];

  // Whichever side is being scored TO should carry their own rating penalty;
  // callers apply this once per direction. Using the max of both here would
  // double-penalize a mutual pair, so this function itself applies neither —
  // callers multiply by the specific subject's penalty if they need to.
  return combine(parts, 0);
}

/**
 * User <-> House (Group Matching): a candidate is scored against the live
 * average of the house's current residents, not just the landlord's stated
 * rules — completing the "aggregate of current residents' preferences, or
 * the landlord's stated house rules" intent the Listing model was already
 * built for. Returns null if the house has no residents with preferences set
 * yet, so the caller falls back to the listing's own static fields.
 */
export function aggregateHousePreferences(residentPrefs: ResidentPreference[]): {
  sleepSchedule: SleepSchedule;
  cleanlinessLevel: number;
  noiseTolerance: number;
  guestPolicy: GuestPolicy;
  allowsSmoking: boolean;
  allowsPets: boolean;
} | null {
  if (residentPrefs.length === 0) return null;

  const mode = <T extends string>(values: T[]): T => {
    const counts = new Map<T, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  const average = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
  const majority = (values: boolean[]) => values.filter(Boolean).length >= values.length / 2;

  return {
    sleepSchedule: mode(residentPrefs.map((p) => p.sleepSchedule)),
    cleanlinessLevel: Math.round(average(residentPrefs.map((p) => p.cleanlinessLevel))),
    noiseTolerance: Math.round(average(residentPrefs.map((p) => p.noiseTolerance))),
    guestPolicy: mode(residentPrefs.map((p) => p.guestPolicy)),
    allowsSmoking: majority(residentPrefs.map((p) => p.smokingOk)),
    allowsPets: majority(residentPrefs.map((p) => p.petsOk)),
  };
}

export interface StableMatchResult {
  userId: string;
  listingId: string;
  compatibilityScore: number;
}

/**
 * Many-to-one stable matching (Hospital/Residents algorithm — the
 * capacity-aware generalization of Gale-Shapley) between residents and
 * listings.
 *
 * - Residents "propose" to their most-preferred listing first.
 * - Each listing tentatively holds its top `capacity` proposers by score
 *   and rejects the rest.
 * - Rejected residents propose to their next-best listing.
 * - Repeats until every resident is matched or has been rejected by
 *   every listing they're compatible with.
 *
 * Result: no resident-listing pair exists where both would prefer each
 * other over their current match (a stable matching).
 */
export function runStableMatching(
  residents: ResidentPreference[],
  listings: ListingInput[]
): StableMatchResult[] {
  const residentPreferenceOrder = new Map<string, { listingId: string; score: number }[]>();
  for (const resident of residents) {
    const ranked = listings
      .map((listing) => ({
        listingId: listing.listingId,
        score: computeCompatibilityScore(resident, listing).score,
      }))
      .sort((a, b) => b.score - a.score);
    residentPreferenceOrder.set(resident.userId, ranked);
  }

  const listingCapacity = new Map(listings.map((l) => [l.listingId, l.capacity]));
  const listingHolds = new Map<string, Map<string, number>>();
  for (const listing of listings) listingHolds.set(listing.listingId, new Map());

  const nextProposalIndex = new Map(residents.map((r) => [r.userId, 0]));
  const unmatched = new Set(residents.map((r) => r.userId));

  while (unmatched.size > 0) {
    const userId = unmatched.values().next().value as string;
    const ranked = residentPreferenceOrder.get(userId)!;
    const idx = nextProposalIndex.get(userId)!;

    if (idx >= ranked.length) {
      unmatched.delete(userId);
      continue;
    }

    const { listingId, score } = ranked[idx];
    nextProposalIndex.set(userId, idx + 1);

    const holds = listingHolds.get(listingId)!;
    const capacity = listingCapacity.get(listingId) ?? 0;

    holds.set(userId, score);
    unmatched.delete(userId);

    if (holds.size > capacity) {
      let worstUser = "";
      let worstScore = Infinity;
      for (const [heldUser, heldScore] of holds) {
        if (heldScore < worstScore) {
          worstScore = heldScore;
          worstUser = heldUser;
        }
      }
      holds.delete(worstUser);
      unmatched.add(worstUser);
    }
  }

  const results: StableMatchResult[] = [];
  for (const [listingId, holds] of listingHolds) {
    for (const [userId, score] of holds) {
      results.push({ userId, listingId, compatibilityScore: score });
    }
  }
  return results;
}
