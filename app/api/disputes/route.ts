import { badRequest, missingFields, ok, readJson, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { assertHouseMember, disputeVisibilityFilter } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import type { DisputeState, DisputeVoteValue } from "@prisma/client";
import { raiseDispute, advanceDisputeState, castDisputeVote } from "@/Araf/M3.5-MessCourt/disputes";

/** M3.5 Mess Court — Md. Mahidul Alam Araf. */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before using the Mess Court.");

  const state = new URL(req.url).searchParams.get("state") as DisputeState | null;

  const disputes = await prisma.dispute.findMany({
    // The visibility filter replaces the old "disputes visible to house and
    // landlord" RLS policy — without it this would return every house's cases.
    where: { AND: [disputeVisibilityFilter(user), { houseId }, ...(state ? [{ state }] : [])] },
    include: { votes: true, events: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return ok({ disputes });
});

type DisputeInput = {
  title: string;
  description?: string;
  category?: string;
  againstUserId?: string | null;
};

/** M3.5: raise a dispute — raisedById: user.id, state RAISED. */
export const POST = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before using the Mess Court.");

  await assertHouseMember(user, houseId);

  const body = await readJson<DisputeInput>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["title"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  try {
    const dispute = await raiseDispute(user.id, houseId, body);
    return ok({ dispute }, 201);
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Failed to raise dispute");
  }
});

type DisputeTransitionInput = {
  disputeId: string;
  targetState: DisputeState;
  note?: string;
  resolution?: string;
};

type DisputeVoteInput = {
  disputeId: string;
  vote: DisputeVoteValue;
  comment?: string;
};

/**
 * M3.5: drive the state machine. Send the target state and let the
 * database validate it — enforce_dispute_transition() raises 23514 on an
 * illegal move, which fromPrismaError() turns into a 400 quoting
 * "Illegal Mess Court transition: X -> Y". Don't duplicate those rules here.
 * Write the DisputeEvent audit row yourself in the same transaction.
 */
export const PATCH = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before using the Mess Court.");

  await assertHouseMember(user, houseId);

  const body = await readJson<DisputeTransitionInput | DisputeVoteInput>(req);
  if (!body) return badRequest("Invalid JSON body");

  // Check if this is a vote request
  if ("vote" in body) {
    const { disputeId, vote, comment } = body as DisputeVoteInput;
    if (!disputeId) return badRequest("disputeId is required for voting");

    try {
      const dispute = await castDisputeVote(user.id, houseId, disputeId, vote, comment);
      return ok({ dispute });
    } catch (err) {
      return badRequest(err instanceof Error ? err.message : "Failed to cast vote");
    }
  }

  // Otherwise, treat as state transition
  const { disputeId, targetState, note, resolution } = body as DisputeTransitionInput;
  if (!disputeId) return badRequest("disputeId is required");
  if (!targetState) return badRequest("targetState is required");

  try {
    const dispute = await advanceDisputeState(user.id, houseId, disputeId, targetState, note, resolution);
    return ok({ dispute });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Failed to transition dispute");
  }
});
