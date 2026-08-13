import { badRequest, notImplemented, ok, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { disputeVisibilityFilter } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import type { DisputeState } from "@prisma/client";

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

/** TODO (M3.5): raise a dispute — raisedById: user.id, state RAISED. */
export const POST = withUser(async () => notImplemented("Raising a dispute"));

/**
 * TODO (M3.5): drive the state machine. Send the target state and let the
 * database validate it — enforce_dispute_transition() raises 23514 on an
 * illegal move, which fromPrismaError() turns into a 400 quoting
 * "Illegal Mess Court transition: X -> Y". Don't duplicate those rules here.
 * Write the DisputeEvent audit row yourself in the same transaction.
 */
export const PATCH = withUser(async () => notImplemented("Transitioning a dispute"));
