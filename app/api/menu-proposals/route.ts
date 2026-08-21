import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { assertHouseMember, isHouseAdmin, isPlatformAdmin } from "@/lib/authz";
import {
  dietaryConflict,
  ensureAndAdvanceWeek,
  mondayOf,
  recentlyServed,
  targetWeekForSubmission,
  validateDayProposalInput,
  type DayProposalInput,
} from "@/lib/menu";
import { prisma } from "@/lib/prisma";
import type { DailyVoteStatus } from "@prisma/client";

/**
 * M2.2 — Daily Meal Proposal & Ranked-Choice Voting (Mahia Tanzin).
 *
 * GET returns a full week's board (all 7 days), each with its live
 * DailyVoteStatus (after a lazy sweep — see lib/menu.ts advanceDailyVote),
 * candidate list, and the caller's own ballot if cast. POST creates or
 * in-place edits the caller's one active candidate for a day — the server
 * resolves which week it targets, never the client, so a stale client can't
 * attach a "late" submission to an already-closed cycle.
 */

export const dynamic = "force-dynamic";

// Blind voting: proposer identity stays hidden from other residents while a
// day's vote is still live, revealed once it's decided one way or another.
const REVEALED_STATUSES: DailyVoteStatus[] = ["DECIDED", "FALLBACK"];

export const GET = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before viewing the menu.");
  await assertHouseMember(user, houseId);

  const raw = new URL(req.url).searchParams.get("weekStartDate");
  const rawDate = raw ? new Date(raw) : new Date();
  if (Number.isNaN(rawDate.getTime())) return badRequest("weekStartDate is not a valid date.");
  const weekStartDate = mondayOf(rawDate);

  const results = await ensureAndAdvanceWeek(houseId, weekStartDate);

  // A FALLBACK day's winner can legitimately belong to a PREVIOUS week (see
  // lib/menu.ts fallbackTo) — the candidate query below is scoped to this
  // week only, so those ids need a separate lookup or they'd silently render
  // as "no winner" even though the backend correctly tracked one.
  const priorWeekWinnerIds = [...new Set(results.map((r) => r.winningProposalId).filter((id): id is string => !!id))];

  const [candidates, priorWeekWinners, myBallots, myself, canManageMenu] = await Promise.all([
    prisma.dayProposal.findMany({
      where: { houseId, weekStartDate },
      select: {
        id: true,
        dayOfWeek: true,
        proposedById: true,
        proposedBy: { select: { name: true } },
        breakfast: true,
        lunch: true,
        dinner: true,
        estimatedCostPerHead: true,
        nutritionProfile: true,
        dietaryTags: true,
        withdrawnAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.dayProposal.findMany({
      where: { id: { in: priorWeekWinnerIds } },
      select: { id: true, breakfast: true, lunch: true, dinner: true, proposedBy: { select: { name: true } } },
    }),
    prisma.dailyBallot.findMany({
      where: { result: { houseId, weekStartDate }, voterId: user.id, round: "MAIN" },
      select: { resultId: true, rankings: { orderBy: { rank: "asc" }, select: { proposalId: true } } },
    }),
    prisma.user.findUnique({ where: { id: user.id }, select: { dietaryRestrictions: true } }),
    isHouseAdmin(user.id, houseId),
  ]);

  const myBallotByResultId = new Map(myBallots.map((b) => [b.resultId, b.rankings.map((r) => r.proposalId)]));
  const priorWeekWinnerById = new Map(priorWeekWinners.map((w) => [w.id, w]));
  const candidatesByDay = new Map<number, typeof candidates>();
  for (const c of candidates) {
    if (!candidatesByDay.has(c.dayOfWeek)) candidatesByDay.set(c.dayOfWeek, []);
    candidatesByDay.get(c.dayOfWeek)!.push(c);
  }
  const admin = isPlatformAdmin(user);
  const myRestrictions = myself?.dietaryRestrictions ?? [];

  const days = await Promise.all(
    results.map(async (result) => {
      const revealed = admin || REVEALED_STATUSES.includes(result.status);
      const dayCandidates = candidatesByDay.get(result.dayOfWeek) ?? [];

      const candidateViews = await Promise.all(
        dayCandidates
          .filter((c) => !c.withdrawnAt)
          .map(async (c) => ({
            id: c.id,
            breakfast: c.breakfast,
            lunch: c.lunch,
            dinner: c.dinner,
            estimatedCostPerHead: c.estimatedCostPerHead ? Number(c.estimatedCostPerHead) : null,
            nutritionProfile: c.nutritionProfile,
            dietaryTags: c.dietaryTags,
            isMine: c.proposedById === user.id,
            proposerName: revealed || admin || c.proposedById === user.id ? c.proposedBy.name : null,
            recentlyServed: await recentlyServed(houseId, weekStartDate, result.dayOfWeek, c),
            hiddenForYou: dietaryConflict(c.dietaryTags, myRestrictions),
          }))
      );

      const winningCandidate = result.winningProposalId
        ? (dayCandidates.find((c) => c.id === result.winningProposalId) ?? priorWeekWinnerById.get(result.winningProposalId))
        : null;

      return {
        dayOfWeek: result.dayOfWeek,
        status: result.status,
        decidedAt: result.decidedAt,
        fallbackReason: result.fallbackReason,
        extendedUntil: result.extendedUntil,
        roundDeadline: result.roundDeadline,
        tieCandidateIds: result.tieCandidateIds,
        winningProposal: winningCandidate
          ? {
              id: winningCandidate.id,
              breakfast: winningCandidate.breakfast,
              lunch: winningCandidate.lunch,
              dinner: winningCandidate.dinner,
              proposerName: winningCandidate.proposedBy.name,
            }
          : null,
        candidates: candidateViews,
        myRanking: myBallotByResultId.get(result.id) ?? null,
      };
    })
  );

  return ok({ weekStartDate, days, canManageMenu: canManageMenu || admin });
});

export const POST = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before proposing a meal.");
  await assertHouseMember(user, houseId);

  const body = await readJson<DayProposalInput & { sourceTemplateId?: string }>(req);
  if (!body) return badRequest("Invalid JSON body");

  const validationError = validateDayProposalInput(body);
  if (validationError) return badRequest(validationError);

  const weekStartDate = targetWeekForSubmission(new Date());

  const existing = await prisma.dayProposal.findFirst({
    where: { houseId, weekStartDate, dayOfWeek: body.dayOfWeek, proposedById: user.id, withdrawnAt: null },
    select: { id: true },
  });

  const data = {
    breakfast: body.breakfast?.trim() || null,
    lunch: body.lunch?.trim() || null,
    dinner: body.dinner?.trim() || null,
    estimatedCostPerHead: body.estimatedCostPerHead != null && body.estimatedCostPerHead !== "" ? Number(body.estimatedCostPerHead) : null,
    nutritionProfile: body.nutritionProfile ?? null,
    dietaryTags: body.dietaryTags ?? [],
    sourceTemplateId: body.sourceTemplateId ?? null,
  };

  const proposal = existing
    ? await prisma.dayProposal.update({ where: { id: existing.id }, data })
    : await prisma.dayProposal.create({
        data: { houseId, weekStartDate, dayOfWeek: body.dayOfWeek, proposedById: user.id, ...data },
      });

  // A fresh candidate for a day whose result row doesn't exist yet needs one
  // to vote against.
  await ensureAndAdvanceWeek(houseId, weekStartDate);

  return ok(proposal, existing ? 200 : 201);
});
