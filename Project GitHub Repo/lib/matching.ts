/**
 * Smart Roommate & House Matching — matching engine.
 *
 * Two parts:
 *  1. computeCompatibilityScore — turns a resident's lifestyle preferences
 *     and a listing's attributes into a single 0..1 compatibility score.
 *  2. runStableMatching — a many-to-one stable matching algorithm
 *     (the "Hospital/Residents" generalization of Gale–Shapley) that
 *     assigns residents to listings so that no resident-listing pair
 *     would both rather be matched to each other than to their current
 *     assignment. Each listing can accept multiple residents (capacity).
 *
 * Why Gale–Shapley / Hospital-Residents instead of a plain sort-by-score:
 * a greedy "give everyone their #1 choice" approach can leave listings
 * over-filled and residents unmatched with no way to resolve conflicts
 * fairly. The Hospital/Residents algorithm guarantees a *stable* outcome:
 * no resident and listing that are not matched to each other would both
 * prefer to be, which is the standard notion of "fair" in matching theory.
 */

export type SleepSchedule = "EARLY_BIRD" | "NIGHT_OWL" | "FLEXIBLE";
export type CleanlinessLevel = "VERY_TIDY" | "MODERATE" | "RELAXED";

export interface ResidentPreference {
  userId: string;
  budgetMin: number;
  budgetMax: number;
  sleepSchedule: SleepSchedule;
  cleanliness: CleanlinessLevel;
  smokingOk: boolean;
  petsOk: boolean;
  preferredArea?: string | null;
}

export interface ListingInput {
  listingId: string;
  rent: number;
  area: string;
  capacity: number;
  // Aggregate lifestyle signal for the listing (e.g. average of current
  // residents' preferences, or the landlord's stated house rules).
  sleepSchedule?: SleepSchedule;
  cleanliness?: CleanlinessLevel;
  allowsSmoking?: boolean;
  allowsPets?: boolean;
}

const SLEEP_COMPATIBILITY: Record<SleepSchedule, Record<SleepSchedule, number>> = {
  EARLY_BIRD: { EARLY_BIRD: 1, FLEXIBLE: 0.75, NIGHT_OWL: 0.2 },
  NIGHT_OWL: { NIGHT_OWL: 1, FLEXIBLE: 0.75, EARLY_BIRD: 0.2 },
  FLEXIBLE: { EARLY_BIRD: 0.75, NIGHT_OWL: 0.75, FLEXIBLE: 1 },
};

const CLEAN_COMPATIBILITY: Record<CleanlinessLevel, Record<CleanlinessLevel, number>> = {
  VERY_TIDY: { VERY_TIDY: 1, MODERATE: 0.6, RELAXED: 0.2 },
  MODERATE: { VERY_TIDY: 0.6, MODERATE: 1, RELAXED: 0.6 },
  RELAXED: { VERY_TIDY: 0.2, MODERATE: 0.6, RELAXED: 1 },
};

/**
 * Weighted compatibility score between a resident's preferences and a listing.
 * Returns a value in [0, 1]. Weights sum to 1 and can be tuned later.
 */
export function computeCompatibilityScore(
  pref: ResidentPreference,
  listing: ListingInput
): number {
  const weights = {
    budget: 0.3,
    area: 0.2,
    sleep: 0.2,
    cleanliness: 0.2,
    smoking: 0.05,
    pets: 0.05,
  };

  // Budget: 1 if rent falls within range, decaying linearly outside it.
  let budgetScore: number;
  if (listing.rent >= pref.budgetMin && listing.rent <= pref.budgetMax) {
    budgetScore = 1;
  } else {
    const distance =
      listing.rent < pref.budgetMin
        ? pref.budgetMin - listing.rent
        : listing.rent - pref.budgetMax;
    const range = Math.max(pref.budgetMax - pref.budgetMin, 1);
    budgetScore = Math.max(0, 1 - distance / range);
  }

  const areaScore =
    !pref.preferredArea || pref.preferredArea.toLowerCase() === listing.area.toLowerCase()
      ? 1
      : 0.3; // not a hard filter — nearby areas still get partial credit upstream

  const sleepScore = listing.sleepSchedule
    ? SLEEP_COMPATIBILITY[pref.sleepSchedule][listing.sleepSchedule]
    : 0.5;

  const cleanScore = listing.cleanliness
    ? CLEAN_COMPATIBILITY[pref.cleanliness][listing.cleanliness]
    : 0.5;

  const smokingScore =
    listing.allowsSmoking === undefined ? 0.5 : pref.smokingOk === listing.allowsSmoking ? 1 : 0.3;

  const petsScore =
    listing.allowsPets === undefined ? 0.5 : pref.petsOk === listing.allowsPets ? 1 : 0.3;

  const total =
    budgetScore * weights.budget +
    areaScore * weights.area +
    sleepScore * weights.sleep +
    cleanScore * weights.cleanliness +
    smokingScore * weights.smoking +
    petsScore * weights.pets;

  return Math.round(total * 1000) / 1000;
}

export interface StableMatchResult {
  userId: string;
  listingId: string;
  compatibilityScore: number;
}

/**
 * Many-to-one stable matching (Hospital/Residents algorithm — the
 * capacity-aware generalization of Gale–Shapley) between residents and
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
  // Precompute every resident's listings ranked by compatibility score, best first.
  const residentPreferenceOrder = new Map<string, { listingId: string; score: number }[]>();
  for (const resident of residents) {
    const ranked = listings
      .map((listing) => ({
        listingId: listing.listingId,
        score: computeCompatibilityScore(resident, listing),
      }))
      .sort((a, b) => b.score - a.score);
    residentPreferenceOrder.set(resident.userId, ranked);
  }

  const listingCapacity = new Map(listings.map((l) => [l.listingId, l.capacity]));
  // Current tentative holds per listing: userId -> score
  const listingHolds = new Map<string, Map<string, number>>();
  for (const listing of listings) listingHolds.set(listing.listingId, new Map());

  // Pointer into each resident's ranked list — how many proposals they've made.
  const nextProposalIndex = new Map(residents.map((r) => [r.userId, 0]));
  const unmatched = new Set(residents.map((r) => r.userId));

  while (unmatched.size > 0) {
    const userId = unmatched.values().next().value as string;
    const ranked = residentPreferenceOrder.get(userId)!;
    const idx = nextProposalIndex.get(userId)!;

    if (idx >= ranked.length) {
      // Exhausted every listing — this resident stays unmatched.
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
      // Over capacity: drop the lowest-scoring holder, they go back to proposing.
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
