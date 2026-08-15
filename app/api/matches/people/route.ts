import { badRequest, notFound, ok, readJson, withUser } from "@/lib/api";
import { assertCanSetMatchRequestStatus, canSeeContactInfo } from "@/lib/authz";
import { expireStalePending } from "@/lib/joinRequests";
import { computeUserCompatibilityScore, type ResidentPreference } from "@/lib/matching";
import { prisma } from "@/lib/prisma";
import type { JoinRequestStatus } from "@prisma/client";

/**
 * M1.2 — User <-> User (Roommate Matching), independent of any listing
 * (Mahia Tanzin).
 *
 * Candidates are every other resident with a preference profile, minus
 * anyone blocked in either direction (Report & Block safety system).
 * Contact info (name/phone/email) is withheld per the Data Access & Privacy
 * Matrix until there's a mutually-accepted request — see
 * lib/authz.ts canSeeContactInfo.
 */

export const dynamic = "force-dynamic";

function toResidentInput(p: {
  userId: string;
  budgetMin: unknown;
  budgetMax: unknown;
  sleepSchedule: ResidentPreference["sleepSchedule"];
  cleanlinessLevel: number;
  noiseTolerance: number;
  guestPolicy: ResidentPreference["guestPolicy"];
  smokingOk: boolean;
  petsOk: boolean;
  preferredArea: string | null;
  budgetWeight: ResidentPreference["budgetWeight"];
  sleepWeight: ResidentPreference["sleepWeight"];
  cleanlinessWeight: ResidentPreference["cleanlinessWeight"];
  noiseWeight: ResidentPreference["noiseWeight"];
  guestWeight: ResidentPreference["guestWeight"];
  smokingWeight: ResidentPreference["smokingWeight"];
  petsWeight: ResidentPreference["petsWeight"];
}): ResidentPreference {
  return {
    userId: p.userId,
    budgetMin: Number(p.budgetMin),
    budgetMax: Number(p.budgetMax),
    sleepSchedule: p.sleepSchedule,
    cleanlinessLevel: p.cleanlinessLevel,
    noiseTolerance: p.noiseTolerance,
    guestPolicy: p.guestPolicy,
    smokingOk: p.smokingOk,
    petsOk: p.petsOk,
    preferredArea: p.preferredArea,
    budgetWeight: p.budgetWeight,
    sleepWeight: p.sleepWeight,
    cleanlinessWeight: p.cleanlinessWeight,
    noiseWeight: p.noiseWeight,
    guestWeight: p.guestWeight,
    smokingWeight: p.smokingWeight,
    petsWeight: p.petsWeight,
  };
}

export const GET = withUser(async (user) => {
  await expireStalePending(prisma.roommateMatchRequest);

  const myPreference = await prisma.preference.findUnique({ where: { userId: user.id } });
  if (!myPreference) return ok({ candidates: [] });
  const mine = toResidentInput(myPreference);

  const [others, blocks, existingRequests, verified] = await Promise.all([
    prisma.preference.findMany({
      where: { userId: { not: user.id } },
      include: {
        user: { select: { name: true, email: true, phone: true, matchRatingPenalty: true } },
      },
    }),
    prisma.userBlock.findMany({
      where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
      select: { blockerId: true, blockedId: true },
    }),
    prisma.roommateMatchRequest.findMany({
      where: { OR: [{ senderId: user.id }, { receiverId: user.id }] },
      select: { id: true, senderId: true, receiverId: true, status: true },
    }),
    prisma.verificationRequest.findMany({
      where: { status: "VERIFIED" },
      select: { userId: true },
    }),
  ]);

  const blockedUserIds = new Set(
    blocks.map((b) => (b.blockerId === user.id ? b.blockedId : b.blockerId))
  );
  const requestByOtherUserId = new Map(
    existingRequests.map((r) => [r.senderId === user.id ? r.receiverId : r.senderId, r])
  );
  const verifiedUserIds = new Set(verified.map((v) => v.userId));

  const candidates = await Promise.all(
    others
      .filter((p) => !blockedUserIds.has(p.userId))
      .map(async (p) => {
        const candidatePref = toResidentInput(p);
        const result = computeUserCompatibilityScore(mine, candidatePref);
        const penalty = p.user.matchRatingPenalty;
        const score = Math.round(result.score * Math.max(0, 1 - penalty / 100) * 1000) / 1000;

        const unlocked = await canSeeContactInfo(user, p.userId);
        const request = requestByOtherUserId.get(p.userId) ?? null;

        return {
          userId: p.userId,
          name: unlocked ? p.user.name : null,
          email: unlocked ? p.user.email : null,
          phone: unlocked ? p.user.phone : null,
          contactUnlocked: unlocked,
          verified: verifiedUserIds.has(p.userId),
          budgetMin: Number(p.budgetMin),
          budgetMax: Number(p.budgetMax),
          preferredArea: p.preferredArea,
          score,
          breakdown: result.breakdown,
          summary: result.summary,
          request: request ? { id: request.id, status: request.status, mine: request.senderId === user.id || undefined } : null,
        };
      })
  );

  candidates.sort((a, b) => b.score - a.score);
  return ok({ candidates });
});

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<{ receiver_id: string; message?: string }>(req);
  if (!body?.receiver_id) return badRequest("receiver_id is required");
  if (body.receiver_id === user.id) return badRequest("You can't send a match request to yourself.");

  const blocked = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: user.id, blockedId: body.receiver_id },
        { blockerId: body.receiver_id, blockedId: user.id },
      ],
    },
    select: { id: true },
  });
  if (blocked) return badRequest("You can't send a request to this user.");

  // The unique index on (senderId, receiverId) catches a duplicate as P2002,
  // turned into a 400 by withUser.
  const request = await prisma.roommateMatchRequest.create({
    data: { senderId: user.id, receiverId: body.receiver_id, message: body.message || null },
  });
  return ok(request, 201);
});

export const PATCH = withUser(async (user, req: Request) => {
  const body = await readJson<{ id: string; status: JoinRequestStatus }>(req);
  if (!body?.id || !body?.status) return badRequest("id and status are required");
  if (body.status !== "ACCEPTED" && body.status !== "REJECTED" && body.status !== "CANCELLED") {
    return badRequest("status must be ACCEPTED, REJECTED, or CANCELLED.");
  }

  await expireStalePending(prisma.roommateMatchRequest);
  const existing = await assertCanSetMatchRequestStatus(user, body.id, body.status);
  if (!existing) return notFound("No such match request");

  const updated = await prisma.roommateMatchRequest.update({
    where: { id: body.id },
    data: { status: body.status },
  });
  return ok(updated);
});
