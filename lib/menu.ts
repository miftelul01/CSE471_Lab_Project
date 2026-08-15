import { prisma } from "@/lib/prisma";
import type { DailyVoteStatus, DietaryTag, MealType, NutritionProfile } from "@prisma/client";

/**
 * M2.2 — Daily Meal Proposal & Ranked-Choice Voting (Mahia Tanzin).
 *
 * Voting granularity is per DAY, not per day+meal-type: one DayProposal is a
 * resident's candidate menu for one specific day (any subset of
 * breakfast/lunch/dinner), and every resident's candidate for that day
 * competes in that day's independent Instant-Runoff ballot.
 *
 * No cron/scheduler exists in this app (same as lib/joinRequests.ts's 14-day
 * expiry). Every timed transition here — the 24h voting window, the 12h
 * quorum extension, the 6h tie-break runoff, the 3h emergency re-vote — is
 * evaluated lazily via advanceDailyVote(), called at the top of the relevant
 * GET/action handlers, comparing a stored deadline against Date.now().
 */

export const MEAL_TYPES: MealType[] = ["BREAKFAST", "LUNCH", "DINNER"];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
};

// dayOfWeek is ISO-style: 0 = Monday ... 6 = Sunday, matching weekStartDate
// always being that week's Monday (see mondayOf below).
export const DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const DIETARY_TAGS: DietaryTag[] = [
  "VEGETARIAN",
  "VEGAN",
  "HALAL",
  "NO_BEEF",
  "NO_PORK",
  "NUT_FREE",
  "DAIRY_FREE",
];

export const DIETARY_TAG_LABELS: Record<DietaryTag, string> = {
  VEGETARIAN: "Vegetarian",
  VEGAN: "Vegan",
  HALAL: "Halal",
  NO_BEEF: "No beef",
  NO_PORK: "No pork",
  NUT_FREE: "Nut-free",
  DAIRY_FREE: "Dairy-free",
};

export const NUTRITION_PROFILES: NutritionProfile[] = ["LIGHT", "BALANCED", "PROTEIN_HEAVY"];

export const NUTRITION_PROFILE_LABELS: Record<NutritionProfile, string> = {
  LIGHT: "Light",
  BALANCED: "Balanced",
  PROTEIN_HEAVY: "Protein-heavy",
};

export const STATUS_LABELS: Record<DailyVoteStatus, string> = {
  OPEN: "Voting open",
  TIE_RUNOFF: "Tie-break runoff",
  EMERGENCY_REVOTE: "Emergency re-vote",
  DECIDED: "Decided",
  FALLBACK: "Fell back",
};

/* ── Calendar helpers ──────────────────────────────────────────────────── */

/**
 * Normalises any date to the Monday of its week (UTC, so it's stable
 * regardless of server timezone). Every DayProposal/DailyMealResult for the
 * same calendar week collapses to this exact value.
 */
export function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday ... 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/** Companion to mondayOf: 0 (Monday) - 6 (Sunday) offset of `date` within its week. */
export function dayOfWeekOf(date: Date): number {
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const monday = mondayOf(dayStart);
  return Math.round((dayStart.getTime() - monday.getTime()) / 86_400_000);
}

/** The actual calendar date of a given day within a week. */
export function dateForDay(weekStartDate: Date, dayOfWeek: number): Date {
  const d = new Date(weekStartDate);
  d.setUTCDate(d.getUTCDate() + dayOfWeek);
  return d;
}

const DHAKA_OFFSET_HOURS = 6;

/** The UTC instant corresponding to `hour:minute` Dhaka-local time on `date` (a UTC-midnight calendar date). */
function dhakaInstant(date: Date, hour: number, minute = 0): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour - DHAKA_OFFSET_HOURS, minute));
}

/** Today's date in Dhaka (UTC+6), as UTC midnight — same convention as lib/wallet.ts's dhakaToday. */
export function dhakaToday(): Date {
  const now = new Date(Date.now() + DHAKA_OFFSET_HOURS * 60 * 60 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/* ── Fixed weekly schedule ─────────────────────────────────────────────── */

export const QUORUM_RATIO = 0.6;
export const QUORUM_EXTENSION_HOURS = 12;
export const TIE_RUNOFF_HOURS = 6;
export const EMERGENCY_REVOTE_HOURS = 3;

/** Saturday 6PM -> Sunday 6PM (Dhaka), the two days immediately before `weekStartDate`. */
export function submissionWindow(weekStartDate: Date): { opensAt: Date; closesAt: Date } {
  const saturday = dateForDay(weekStartDate, -2);
  const sunday = dateForDay(weekStartDate, -1);
  return { opensAt: dhakaInstant(saturday, 18), closesAt: dhakaInstant(sunday, 18) };
}

/** Sunday 6PM -> Monday 6PM (Dhaka) — voting concludes right as the target week begins. */
export function votingWindow(weekStartDate: Date): { opensAt: Date; closesAt: Date } {
  const sunday = dateForDay(weekStartDate, -1);
  return { opensAt: dhakaInstant(sunday, 18), closesAt: dhakaInstant(weekStartDate, 18) };
}

export function isWithin(now: Date, window: { opensAt: Date; closesAt: Date }): boolean {
  return now.getTime() >= window.opensAt.getTime() && now.getTime() < window.closesAt.getTime();
}

/**
 * Resolves which week's cycle a submission made *right now* belongs to.
 * Submissions are never rejected outright for being outside the nominal
 * Sat-Sun window — the server just walks forward to the next week whose
 * submission window hasn't closed yet, which is how "late submissions queue
 * for the following week's cycle" is implemented.
 */
export function targetWeekForSubmission(now: Date = new Date()): Date {
  let candidate = dateForDay(mondayOf(now), 7);
  while (now.getTime() >= submissionWindow(candidate).closesAt.getTime()) {
    candidate = dateForDay(candidate, 7);
  }
  return candidate;
}

/** Whether a resident can still edit/withdraw their own candidate outright (pre-voting). */
export function canEditProposal(weekStartDate: Date, now: Date = new Date()): boolean {
  return now.getTime() < submissionWindow(weekStartDate).closesAt.getTime();
}

/* ── Validation ────────────────────────────────────────────────────────── */

export const MAX_MEAL_TEXT_LENGTH = 200;
export const MAX_TEMPLATE_NAME_LENGTH = 80;
export const MAX_COST_PER_HEAD = 100_000;

export type DayProposalInput = {
  dayOfWeek: number;
  breakfast?: string | null;
  lunch?: string | null;
  dinner?: string | null;
  estimatedCostPerHead?: number | string | null;
  nutritionProfile?: NutritionProfile | null;
  dietaryTags?: DietaryTag[];
};

export function validateDayProposalInput(input: unknown): string | null {
  if (typeof input !== "object" || input === null) return "Invalid proposal.";
  const { dayOfWeek, breakfast, lunch, dinner, estimatedCostPerHead, nutritionProfile, dietaryTags } =
    input as Partial<DayProposalInput>;

  if (typeof dayOfWeek !== "number" || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return "dayOfWeek must be a whole number from 0 (Monday) to 6 (Sunday).";
  }
  const meals = [breakfast, lunch, dinner].filter((v) => v != null && String(v).trim().length > 0);
  if (meals.length === 0) return "Fill in at least one of breakfast, lunch, or dinner.";
  for (const v of [breakfast, lunch, dinner]) {
    if (v != null && String(v).trim().length > MAX_MEAL_TEXT_LENGTH) {
      return `Each meal description must be ${MAX_MEAL_TEXT_LENGTH} characters or fewer.`;
    }
  }
  if (estimatedCostPerHead != null && estimatedCostPerHead !== "") {
    const cost = Number(estimatedCostPerHead);
    if (!Number.isFinite(cost) || cost < 0 || cost > MAX_COST_PER_HEAD) {
      return `Estimated cost per head must be between 0 and ${MAX_COST_PER_HEAD}.`;
    }
  }
  if (nutritionProfile != null && !NUTRITION_PROFILES.includes(nutritionProfile)) {
    return "Invalid nutrition profile.";
  }
  if (dietaryTags != null) {
    if (!Array.isArray(dietaryTags)) return "dietaryTags must be an array.";
    if (dietaryTags.some((t) => !DIETARY_TAGS.includes(t))) return "Invalid dietary tag.";
  }
  return null;
}

export function validateRankedBallot(rankedProposalIds: unknown, candidateIds: string[]): string | null {
  if (!Array.isArray(rankedProposalIds) || rankedProposalIds.length === 0) {
    return "Rank at least one candidate.";
  }
  const unique = new Set(rankedProposalIds);
  if (unique.size !== rankedProposalIds.length) return "A candidate can only appear once in your ranking.";
  for (const id of rankedProposalIds) {
    if (typeof id !== "string" || !candidateIds.includes(id)) {
      return "Your ranking includes a candidate that isn't available to vote on.";
    }
  }
  return null;
}

/* ── Instant-Runoff Voting ─────────────────────────────────────────────── */

export interface IRVResult {
  winnerId: string | null;
  /** Populated only when the field ends in an exact tie with nobody to eliminate. */
  tiedIds: string[];
}

/**
 * Pure, no I/O. `ballots` is each voter's ranked candidate-id list (already
 * filtered to real candidates — a caller should drop ids that don't exist,
 * but a WITHDRAWN candidate still present in an old ranking is handled here:
 * withdrawn ids simply aren't in `candidateIds`, so `remaining.has(id)` skips
 * them and the voter's preference gracefully falls through to their next
 * choice). `weights` (optional, same length/order as `ballots`) lets a
 * specific voter's ballot count fractionally — used for the vote-weight
 * decay enhancement.
 */
export function tallyIRV(candidateIds: string[], ballots: string[][], weights?: number[]): IRVResult {
  if (candidateIds.length === 0) return { winnerId: null, tiedIds: [] };
  if (candidateIds.length === 1) return { winnerId: candidateIds[0], tiedIds: [] };

  let remaining = new Set(candidateIds);

  while (remaining.size > 0) {
    const counts = new Map<string, number>();
    for (const id of remaining) counts.set(id, 0);
    let activeWeight = 0;

    ballots.forEach((ranking, i) => {
      const weight = weights?.[i] ?? 1;
      const firstChoice = ranking.find((id) => remaining.has(id));
      if (firstChoice !== undefined) {
        counts.set(firstChoice, (counts.get(firstChoice) ?? 0) + weight);
        activeWeight += weight;
      }
    });

    if (activeWeight === 0) {
      // Nobody still in play has a live preference — an exact tie among
      // whatever's left (includes the "nobody voted at all" case).
      return { winnerId: null, tiedIds: [...remaining] };
    }

    let leader: string | null = null;
    let leaderCount = -1;
    for (const [id, count] of counts) {
      if (count > leaderCount) {
        leader = id;
        leaderCount = count;
      }
    }
    if (leaderCount > activeWeight / 2) {
      return { winnerId: leader, tiedIds: [] };
    }
    if (remaining.size === 1) {
      // Nothing left to eliminate against — this is the winner even without
      // a strict majority (e.g. abstentions on the rest of the ballot).
      return { winnerId: leader, tiedIds: [] };
    }

    const lowest = Math.min(...counts.values());
    const toEliminate = [...counts.entries()].filter(([, c]) => c === lowest).map(([id]) => id);

    if (toEliminate.length === remaining.size) {
      // Eliminating everyone tied for last would wipe the whole remaining
      // field at once — that's the terminal exact tie.
      return { winnerId: null, tiedIds: toEliminate };
    }
    for (const id of toEliminate) remaining.delete(id);
  }

  /* istanbul ignore next -- unreachable, loop always returns */
  return { winnerId: null, tiedIds: [] };
}

/* ── Tie-break tiers ───────────────────────────────────────────────────── */

export interface TieBreakCandidate {
  id: string;
  estimatedCostPerHead: number | null;
  dietaryTags: DietaryTag[];
}

/**
 * Fraction of house residents WITH a declared restriction whose restriction
 * is fully satisfied by `tags`. Residents with no declared restriction don't
 * affect the score either way. A house where nobody has declared anything
 * scores every candidate 1 (fully compatible by definition — nothing to
 * violate).
 */
export function dietaryCompatibilityScore(tags: DietaryTag[], residentRestrictions: DietaryTag[][]): number {
  const withRestrictions = residentRestrictions.filter((r) => r.length > 0);
  if (withRestrictions.length === 0) return 1;
  const satisfied = withRestrictions.filter((r) => r.every((tag) => tags.includes(tag))).length;
  return satisfied / withRestrictions.length;
}

export function resolveTieBreak(
  tiedIds: string[],
  candidatesById: Map<string, TieBreakCandidate>,
  residentRestrictions: DietaryTag[][]
): { winnerId: string | null; stillTiedIds: string[] } {
  const scored = tiedIds.map((id) => {
    const c = candidatesById.get(id)!;
    return { id, dietary: dietaryCompatibilityScore(c.dietaryTags, residentRestrictions), cost: c.estimatedCostPerHead };
  });

  const maxDietary = Math.max(...scored.map((s) => s.dietary));
  let survivors = scored.filter((s) => s.dietary === maxDietary);
  if (survivors.length === 1) return { winnerId: survivors[0].id, stillTiedIds: [] };

  // Missing cost is treated as worst-case (never wins purely by omission).
  const minCost = Math.min(...survivors.map((s) => s.cost ?? Infinity));
  survivors = survivors.filter((s) => (s.cost ?? Infinity) === minCost);
  if (survivors.length === 1) return { winnerId: survivors[0].id, stillTiedIds: [] };

  return { winnerId: null, stillTiedIds: survivors.map((s) => s.id) };
}

/** A resident's own declared restriction not present in a candidate's tags — hides it from their ballot. */
export function dietaryConflict(candidateTags: DietaryTag[], residentRestrictions: DietaryTag[]): boolean {
  return residentRestrictions.some((tag) => !candidateTags.includes(tag));
}

/* ── Vote-weight decay (scoped enhancement) ───────────────────────────── */

/**
 * A resident whose own proposals have won multiple days recently gets a
 * slightly reduced ballot weight for a while — this dampens THEIR vote's
 * influence, never a proposal's eligibility to win.
 */
export async function voterWeight(userId: string, houseId: string, weekStartDate: Date): Promise<number> {
  const previousWeek = dateForDay(weekStartDate, -7);
  const wins = await prisma.dailyMealResult.findMany({
    where: {
      houseId,
      weekStartDate: { in: [weekStartDate, previousWeek] },
      status: "DECIDED",
      winningProposal: { proposedById: userId },
    },
    select: { id: true },
  });
  return Math.max(0.5, Math.pow(0.8, wins.length));
}

/* ── Variety enforcement (scoped enhancement) ─────────────────────────── */

/** Whether any of a candidate's meal texts exactly match an earlier-decided day's winner this same week. */
export async function recentlyServed(
  houseId: string,
  weekStartDate: Date,
  dayOfWeek: number,
  meal: { breakfast?: string | null; lunch?: string | null; dinner?: string | null }
): Promise<boolean> {
  const mine = [meal.breakfast, meal.lunch, meal.dinner]
    .map((v) => v?.trim().toLowerCase())
    .filter((v): v is string => !!v);
  if (mine.length === 0) return false;

  const earlier = await prisma.dailyMealResult.findMany({
    where: { houseId, weekStartDate, dayOfWeek: { lt: dayOfWeek }, status: "DECIDED" },
    select: { winningProposal: { select: { breakfast: true, lunch: true, dinner: true } } },
  });
  return earlier.some((r) => {
    if (!r.winningProposal) return false;
    const theirs = [r.winningProposal.breakfast, r.winningProposal.lunch, r.winningProposal.dinner]
      .map((v) => v?.trim().toLowerCase())
      .filter((v): v is string => !!v);
    return mine.some((m) => theirs.includes(m));
  });
}

/* ── Lazy state-machine sweep ──────────────────────────────────────────── */

export type DailyResultRow = {
  id: string;
  houseId: string;
  weekStartDate: Date;
  dayOfWeek: number;
  status: DailyVoteStatus;
  winningProposalId: string | null;
  fallbackReason: string | null;
  extendedUntil: Date | null;
  tieCandidateIds: string[];
  roundDeadline: Date | null;
  decidedAt: Date | null;
};

async function decide(result: DailyResultRow, winningProposalId: string): Promise<void> {
  await prisma.dailyMealResult.update({
    where: { id: result.id },
    data: { status: "DECIDED", winningProposalId, decidedAt: new Date(), fallbackReason: null },
  });
}

async function fallbackTo(result: DailyResultRow, reason: string): Promise<void> {
  const previousWeek = dateForDay(result.weekStartDate, -7);
  const previous = await prisma.dailyMealResult.findUnique({
    where: {
      houseId_weekStartDate_dayOfWeek: {
        houseId: result.houseId,
        weekStartDate: previousWeek,
        dayOfWeek: result.dayOfWeek,
      },
    },
    select: { status: true, winningProposalId: true },
  });
  const winningProposalId = previous?.status === "DECIDED" ? previous.winningProposalId : null;
  await prisma.dailyMealResult.update({
    where: { id: result.id },
    data: { status: "FALLBACK", winningProposalId, fallbackReason: reason, decidedAt: new Date() },
  });
}

/** All non-withdrawn candidates for this day except whichever one is currently recorded as the winner. */
export async function emergencyEligibleCandidateIds(result: DailyResultRow): Promise<string[]> {
  const candidates = await prisma.dayProposal.findMany({
    where: {
      houseId: result.houseId,
      weekStartDate: result.weekStartDate,
      dayOfWeek: result.dayOfWeek,
      withdrawnAt: null,
    },
    select: { id: true },
  });
  return candidates.map((c) => c.id).filter((id) => id !== result.winningProposalId);
}

/**
 * The single lazy-sweep entry point — idempotent, safe to call on every
 * request. Walks a DailyMealResult through OPEN -> [extended] -> DECIDED /
 * TIE_RUNOFF -> DECIDED / FALLBACK, or handles an already-triggered
 * EMERGENCY_REVOTE's deadline. Does nothing once DECIDED/FALLBACK (terminal).
 */
export async function advanceDailyVote(result: DailyResultRow): Promise<void> {
  const now = new Date();

  if (result.status === "DECIDED" || result.status === "FALLBACK") return;

  if (result.status === "OPEN") {
    const deadline = result.extendedUntil ?? votingWindow(result.weekStartDate).closesAt;
    if (now < deadline) return;

    const [activeMembers, candidates, ballots] = await Promise.all([
      prisma.houseMember.findMany({ where: { houseId: result.houseId, status: "ACTIVE" }, select: { userId: true } }),
      prisma.dayProposal.findMany({
        where: {
          houseId: result.houseId,
          weekStartDate: result.weekStartDate,
          dayOfWeek: result.dayOfWeek,
          withdrawnAt: null,
        },
        select: { id: true, proposedById: true, estimatedCostPerHead: true, dietaryTags: true },
      }),
      prisma.dailyBallot.findMany({
        where: { resultId: result.id, round: "MAIN" },
        select: { voterId: true, rankings: { orderBy: { rank: "asc" }, select: { proposalId: true } } },
      }),
    ]);

    if (candidates.length === 0) {
      await fallbackTo(result, "no_candidates");
      return;
    }

    const quorumNeeded = Math.ceil(activeMembers.length * QUORUM_RATIO);
    const quorumMet = ballots.length >= quorumNeeded;

    if (!quorumMet) {
      if (!result.extendedUntil) {
        await prisma.dailyMealResult.update({
          where: { id: result.id },
          data: { extendedUntil: new Date(deadline.getTime() + QUORUM_EXTENSION_HOURS * 3_600_000) },
        });
        return;
      }
      await fallbackTo(result, "quorum_not_met");
      return;
    }

    const residents = await prisma.user.findMany({
      where: { id: { in: activeMembers.map((m) => m.userId) } },
      select: { dietaryRestrictions: true },
    });
    const weights = await Promise.all(
      ballots.map((b) => voterWeight(b.voterId, result.houseId, result.weekStartDate))
    );
    const candidateIds = candidates.map((c) => c.id);
    const rankings = ballots.map((b) => b.rankings.map((r) => r.proposalId));
    const { winnerId, tiedIds } = tallyIRV(candidateIds, rankings, weights);

    if (winnerId) {
      await decide(result, winnerId);
      return;
    }

    const candidatesById = new Map(
      candidates.map((c) => [
        c.id,
        {
          id: c.id,
          estimatedCostPerHead: c.estimatedCostPerHead ? Number(c.estimatedCostPerHead) : null,
          dietaryTags: c.dietaryTags,
        },
      ])
    );
    const { winnerId: tieWinner, stillTiedIds } = resolveTieBreak(
      tiedIds,
      candidatesById,
      residents.map((r) => r.dietaryRestrictions)
    );
    if (tieWinner) {
      await decide(result, tieWinner);
      return;
    }

    await prisma.dailyMealResult.update({
      where: { id: result.id },
      data: {
        status: "TIE_RUNOFF",
        tieCandidateIds: stillTiedIds,
        roundDeadline: new Date(now.getTime() + TIE_RUNOFF_HOURS * 3_600_000),
      },
    });
    return;
  }

  if (result.status === "TIE_RUNOFF") {
    if (!result.roundDeadline || now < result.roundDeadline) return;

    const ballots = await prisma.dailyBallot.findMany({
      where: { resultId: result.id, round: "TIE_RUNOFF" },
      select: { rankings: { select: { proposalId: true } } },
    });
    const counts = new Map<string, number>();
    for (const id of result.tieCandidateIds) counts.set(id, 0);
    for (const b of ballots) {
      const choice = b.rankings[0]?.proposalId;
      if (choice && counts.has(choice)) counts.set(choice, (counts.get(choice) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted[0]?.[1] ?? 0;
    const leaders = sorted.filter(([, c]) => c === top);

    if (top > 0 && leaders.length === 1) {
      await decide(result, leaders[0][0]);
    } else {
      // No further tier is defined for a still-tied automated runoff — this
      // is a deliberate terminal rule, not an oversight.
      await fallbackTo(result, "tie_runoff_unresolved");
    }
    return;
  }

  if (result.status === "EMERGENCY_REVOTE") {
    if (!result.roundDeadline || now < result.roundDeadline) return;

    const eligibleIds = await emergencyEligibleCandidateIds(result);
    const ballots = await prisma.dailyBallot.findMany({
      where: { resultId: result.id, round: "EMERGENCY" },
      select: { rankings: { orderBy: { rank: "asc" }, select: { proposalId: true } } },
    });
    const rankings = ballots.map((b) => b.rankings.map((r) => r.proposalId));
    const { winnerId } = tallyIRV(eligibleIds, rankings);

    if (winnerId) {
      await decide(result, winnerId);
    } else {
      await fallbackTo(result, "emergency_revote_unresolved");
    }
  }
}

/** Ensures a DailyMealResult row exists (OPEN) for every day of a week, then sweeps each through advanceDailyVote. */
export async function ensureAndAdvanceWeek(houseId: string, weekStartDate: Date): Promise<DailyResultRow[]> {
  const existing = await prisma.dailyMealResult.findMany({ where: { houseId, weekStartDate } });
  const existingByDay = new Map(existing.map((r) => [r.dayOfWeek, r]));

  const missingDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !existingByDay.has(d));
  if (missingDays.length > 0) {
    await prisma.dailyMealResult.createMany({
      data: missingDays.map((dayOfWeek) => ({ houseId, weekStartDate, dayOfWeek })),
      skipDuplicates: true,
    });
  }

  const all = missingDays.length > 0
    ? await prisma.dailyMealResult.findMany({ where: { houseId, weekStartDate }, orderBy: { dayOfWeek: "asc" } })
    : existing.sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  await Promise.all(all.map((r) => advanceDailyVote(r)));

  // Re-read so callers see post-sweep state.
  return prisma.dailyMealResult.findMany({ where: { houseId, weekStartDate }, orderBy: { dayOfWeek: "asc" } });
}
