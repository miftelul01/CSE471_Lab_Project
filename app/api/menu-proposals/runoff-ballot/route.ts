import { badRequest, notFound, ok, readJson, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { assertHouseMember } from "@/lib/authz";
import { advanceDailyVote, emergencyEligibleCandidateIds, mondayOf, validateRankedBallot } from "@/lib/menu";
import { prisma } from "@/lib/prisma";
import type { VoteRound } from "@prisma/client";

/**
 * M2.2 — cast a ballot in the smaller TIE_RUNOFF (6h, single pick among the
 * exact-tied finalists) or EMERGENCY_REVOTE (3h, ranked among the original
 * non-winning candidates) round (Mahia Tanzin).
 */

export const dynamic = "force-dynamic";

type BallotBody = { weekStartDate: string; dayOfWeek: number; rankedProposalIds: string[] };

export const POST = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before voting.");
  await assertHouseMember(user, houseId);

  const body = await readJson<BallotBody>(req);
  if (!body?.weekStartDate || body.dayOfWeek == null || !body.rankedProposalIds) {
    return badRequest("weekStartDate, dayOfWeek and rankedProposalIds are required");
  }
  const weekStartDate = mondayOf(new Date(body.weekStartDate));

  const result = await prisma.dailyMealResult.findUnique({
    where: { houseId_weekStartDate_dayOfWeek: { houseId, weekStartDate, dayOfWeek: body.dayOfWeek } },
  });
  if (!result) return notFound("No vote in progress for that day.");
  await advanceDailyVote(result);
  const fresh = await prisma.dailyMealResult.findUniqueOrThrow({ where: { id: result.id } });

  if (fresh.status !== "TIE_RUNOFF" && fresh.status !== "EMERGENCY_REVOTE") {
    return badRequest(`There's no active runoff for that day right now (status: ${fresh.status}).`);
  }

  const round: VoteRound = fresh.status === "TIE_RUNOFF" ? "TIE_RUNOFF" : "EMERGENCY";
  const eligibleIds = round === "TIE_RUNOFF" ? fresh.tieCandidateIds : await emergencyEligibleCandidateIds(fresh);

  const validationError = validateRankedBallot(body.rankedProposalIds, eligibleIds);
  if (validationError) return badRequest(validationError);
  if (round === "TIE_RUNOFF" && body.rankedProposalIds.length !== 1) {
    return badRequest("The tie-break runoff is a single pick, not a ranking.");
  }

  await prisma.$transaction(async (tx) => {
    const ballot = await tx.dailyBallot.upsert({
      where: { resultId_voterId_round: { resultId: fresh.id, voterId: user.id, round } },
      create: { resultId: fresh.id, voterId: user.id, round },
      update: {},
    });
    await tx.dailyBallotRanking.deleteMany({ where: { ballotId: ballot.id } });
    await tx.dailyBallotRanking.createMany({
      data: body.rankedProposalIds.map((proposalId, i) => ({ ballotId: ballot.id, proposalId, rank: i + 1 })),
    });
  });

  return ok({ success: true });
});
