import { badRequest, notFound, ok, readJson, withAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import type { DisputeState, Prisma } from "@prisma/client";

/**
 * M1.2 — Post-Move-In Feedback Window, admin resolution (Mahia Tanzin).
 *
 * A separate, self-contained endpoint rather than a change to Araf's
 * app/api/admin/disputes/route.ts — that one only allows ESCALATED ->
 * RESOLVED/ARCHIVED, and the RAISED -> VOTING -> ESCALATED path (the rest of
 * M3.5) isn't built yet. This walks a PROFILE_DISHONESTY complaint through
 * whatever legal intermediate states the DB trigger requires
 * (dispute_transition_allowed in domain_rules/migration.sql) to reach
 * RESOLVED, in one transaction, and — only for upheld complaints — applies
 * the match rating penalty in the same transaction.
 */

export const dynamic = "force-dynamic";

const MAX_PENALTY = 50;
const PENALTY_PER_UPHELD_COMPLAINT = 10;

export const PATCH = withAdmin(async (user, req: Request) => {
  const body = await readJson<{ id: string; uphold: boolean; resolution: string }>(req);
  if (!body?.id || !body?.resolution?.trim()) return badRequest("id and resolution are required");

  const dispute = await prisma.dispute.findUnique({
    where: { id: body.id },
    select: { id: true, state: true, category: true, againstUserId: true },
  });
  if (!dispute) return notFound("No such dispute");
  if (dispute.category !== "PROFILE_DISHONESTY") {
    return badRequest("This endpoint only resolves post-move-in profile complaints.");
  }
  if (dispute.state === "RESOLVED" || dispute.state === "ARCHIVED") {
    return badRequest(`This complaint is already ${dispute.state.toLowerCase()}.`);
  }
  if (!dispute.againstUserId) {
    return badRequest("This complaint has no named subject to penalize.");
  }

  let targetPenalty: number | null = null;
  if (body.uphold) {
    const subject = await prisma.user.findUnique({
      where: { id: dispute.againstUserId },
      select: { matchRatingPenalty: true },
    });
    targetPenalty = Math.min(MAX_PENALTY, (subject?.matchRatingPenalty ?? 0) + PENALTY_PER_UPHELD_COMPLAINT);
  }

  // Legal path to RESOLVED, per dispute_transition_allowed: RAISED -> VOTING
  // -> RESOLVED, or VOTING -> RESOLVED, or ESCALATED -> RESOLVED.
  const path: DisputeState[] = dispute.state === "RAISED" ? ["VOTING", "RESOLVED"] : ["RESOLVED"];

  const operations: Prisma.PrismaPromise<unknown>[] = [];
  let fromState: DisputeState = dispute.state;
  for (const toState of path) {
    operations.push(
      prisma.dispute.update({
        where: { id: dispute.id },
        data: {
          state: toState,
          ...(toState === "RESOLVED" ? { resolution: body.resolution.trim() } : {}),
        },
      })
    );
    operations.push(
      prisma.disputeEvent.create({
        data: { disputeId: dispute.id, actorId: user.id, fromState, toState, note: null },
      })
    );
    fromState = toState;
  }
  if (targetPenalty !== null) {
    operations.push(
      prisma.user.update({
        where: { id: dispute.againstUserId },
        data: { matchRatingPenalty: targetPenalty },
      })
    );
  }

  await prisma.$transaction(operations);

  const resolved = await prisma.dispute.findUnique({ where: { id: dispute.id } });
  return ok(resolved);
});
