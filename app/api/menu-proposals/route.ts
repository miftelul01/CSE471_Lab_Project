import { badRequest, notImplemented, ok, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** M2.2 Weekly Menu Proposal & Voting System — Mahia Tanzin. */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before proposing menus.");

  const week = new URL(req.url).searchParams.get("week_start_date");
  const proposals = await prisma.menuProposal.findMany({
    where: { houseId, ...(week ? { weekStartDate: new Date(week) } : {}) },
    include: { items: true, votes: true, proposedBy: { select: { id: true, name: true } } },
    orderBy: { weekStartDate: "desc" },
  });
  return ok({ proposals });
});

/**
 * TODO (M2.2): create the proposal and its items in one prisma.$transaction.
 * Normalise weekStartDate to the Monday of that week, or the partial unique
 * index "one approved menu per house per week" won't line up.
 */
export const POST = withUser(async () => notImplemented("Proposing a weekly menu"));

/** TODO (M2.2): close voting — highest net score becomes APPROVED. */
export const PATCH = withUser(async () => notImplemented("Closing menu voting"));
