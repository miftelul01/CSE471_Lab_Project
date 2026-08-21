import { badRequest, notFound, ok, readJson, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { assertHouseMember } from "@/lib/authz";
import { advanceDailyVote, dietaryConflict, mondayOf, validateRankedBallot } from "@/lib/menu";
import { prisma } from "@/lib/prisma";

/**
 * M2.2 — cast/replace the caller's MAIN-round ranked ballot for one day
 * (Mahia Tanzin). One ballot per resident per day, tied to their account —
 * enforced by the (resultId, voterId, round) unique index.
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

  if (fresh.status !== "OPEN") {
    return badRequest(`Voting for that day is no longer open (status: ${fresh.status}).`);
  }

  const [candidates, myself] = await Promise.all([
    prisma.dayProposal.findMany({
      where: { houseId, weekStartDate, dayOfWeek: body.dayOfWeek, withdrawnAt: null },
      select: { id: true, dietaryTags: true },
    }),
    prisma.user.findUnique({ where: { id: user.id }, select: { dietaryRestrictions: true } }),
  ]);
  const myRestrictions = myself?.dietaryRestrictions ?? [];
  // Dietary filter: a candidate conflicting with the voter's own declared
  // restrictions never appears as a rankable option for them.
  const allowedIds = candidates.filter((c) => !dietaryConflict(c.dietaryTags, myRestrictions)).map((c) => c.id);

  const validationError = validateRankedBallot(body.rankedProposalIds, allowedIds);
  if (validationError) return badRequest(validationError);

  await prisma.$transaction(async (tx) => {
    const ballot = await tx.dailyBallot.upsert({
      where: { resultId_voterId_round: { resultId: fresh.id, voterId: user.id, round: "MAIN" } },
      create: { resultId: fresh.id, voterId: user.id, round: "MAIN" },
      update: {},
    });
    await tx.dailyBallotRanking.deleteMany({ where: { ballotId: ballot.id } });
    await tx.dailyBallotRanking.createMany({
      data: body.rankedProposalIds.map((proposalId, i) => ({ ballotId: ballot.id, proposalId, rank: i + 1 })),
    });
  });

  return ok({ success: true });
});
