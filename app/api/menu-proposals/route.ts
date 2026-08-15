import { HttpError, badRequest, missingFields, ok, readJson, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { assertCanCloseMenuVoting, assertHouseMember } from "@/lib/authz";
import {
  MAX_PROPOSAL_TITLE_LENGTH,
  mondayOf,
  validateProposalItems,
  type ProposalItemInput,
} from "@/lib/menu";
import { prisma } from "@/lib/prisma";

/** M2.2 Weekly Menu Proposal & Voting System — Mahia Tanzin. */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before proposing menus.");

  // Validated like the other two verbs. Left raw, an unparseable value reached
  // Prisma as an Invalid Date and came back through the generic validation
  // handler instead of saying what was wrong.
  const week = new URL(req.url).searchParams.get("week_start_date");
  let weekStartDate: Date | null = null;
  if (week) {
    const parsed = new Date(week);
    if (Number.isNaN(parsed.getTime())) {
      return badRequest("week_start_date is not a valid date.");
    }
    weekStartDate = mondayOf(parsed);
  }

  const proposals = await prisma.menuProposal.findMany({
    where: { houseId, ...(weekStartDate ? { weekStartDate } : {}) },
    include: { items: true, votes: true, proposedBy: { select: { id: true, name: true } } },
    orderBy: { weekStartDate: "desc" },
  });
  return ok({ proposals });
});

type ProposeBody = {
  title?: string;
  weekStartDate: string;
  items: ProposalItemInput[];
};

/**
 * Propose a week's menu. Any house member may propose — the brief has
 * residents at large doing this, not just the flat admin.
 *
 * weekStartDate is normalised to that week's Monday server-side regardless of
 * what the client sends, because the partial unique index that enforces "one
 * approved menu per house per week" is keyed on that exact date matching
 * across every competing proposal.
 */
export const POST = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before proposing menus.");
  await assertHouseMember(user, houseId);

  const body = await readJson<ProposeBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["weekStartDate", "items"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  const rawDate = new Date(body.weekStartDate);
  if (Number.isNaN(rawDate.getTime())) return badRequest("weekStartDate is not a valid date.");
  const weekStartDate = mondayOf(rawDate);

  const itemsError = validateProposalItems(body.items);
  if (itemsError) return badRequest(itemsError);

  if (body.title && String(body.title).trim().length > MAX_PROPOSAL_TITLE_LENGTH) {
    return badRequest(`Title must be ${MAX_PROPOSAL_TITLE_LENGTH} characters or fewer.`);
  }

  // A week that's already been decided doesn't need more proposals competing
  // for a vote that's already closed.
  const alreadyApproved = await prisma.menuProposal.findFirst({
    where: { houseId, weekStartDate, status: "APPROVED" },
    select: { id: true },
  });
  if (alreadyApproved) return badRequest("This week's menu has already been finalized.");

  const title = body.title?.trim() || `Menu for week of ${weekStartDate.toISOString().slice(0, 10)}`;

  const proposal = await prisma.menuProposal.create({
    data: {
      houseId,
      proposedById: user.id,
      title,
      weekStartDate,
      status: "OPEN",
      items: {
        create: body.items.map((item) => ({
          dayOfWeek: item.dayOfWeek,
          mealType: item.mealType,
          description: String(item.description).trim(),
        })),
      },
    },
    include: { items: true, proposedBy: { select: { id: true, name: true } } },
  });

  return ok({ proposal }, 201);
});

type CloseBody = { weekStartDate: string };

/**
 * Close voting for a week: the OPEN proposal with the highest net score
 * (sum of +1/-1 votes) becomes APPROVED, every other OPEN proposal for that
 * same house+week becomes REJECTED. Ties go to whichever was proposed first —
 * simple and deterministic. A lone proposal wins by default even with zero or
 * negative votes, since it's the only option on the table.
 */
export const PATCH = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before closing menu voting.");
  await assertCanCloseMenuVoting(user, houseId);

  const body = await readJson<CloseBody>(req);
  if (!body?.weekStartDate) return badRequest("weekStartDate is required");

  const rawDate = new Date(body.weekStartDate);
  if (Number.isNaN(rawDate.getTime())) return badRequest("weekStartDate is not a valid date.");
  const weekStartDate = mondayOf(rawDate);

  /**
   * Tallying and closing happen inside one transaction.
   *
   * The read used to sit outside it, so two admins pressing "close voting" at
   * the same moment could each pick a winner from the same set of open
   * proposals. The partial unique index on approved-menu-per-week would stop
   * the second write landing, but the loser saw a raw "That already exists."
   * Re-checking inside the transaction turns that into a sentence describing
   * what actually happened.
   */
  const result = await prisma.$transaction(async (tx) => {
    const alreadyApproved = await tx.menuProposal.findFirst({
      where: { houseId, weekStartDate, status: "APPROVED" },
      select: { id: true },
    });
    if (alreadyApproved) {
      throw new HttpError("This week's menu has already been finalized.", 409);
    }

    const openProposals = await tx.menuProposal.findMany({
      where: { houseId, weekStartDate, status: "OPEN" },
      include: { votes: { select: { vote: true } } },
      orderBy: { createdAt: "asc" },
    });
    if (openProposals.length === 0) {
      throw new HttpError("No open proposals for that week.", 400);
    }

    const scored = openProposals.map((p) => ({
      id: p.id,
      score: p.votes.reduce((sum, v) => sum + v.vote, 0),
    }));
    // Strict `>` with a createdAt-ascending list means a tie goes to whichever
    // was proposed first.
    const winner = scored.reduce((best, p) => (p.score > best.score ? p : best), scored[0]);
    const rejectedIds = scored.filter((p) => p.id !== winner.id).map((p) => p.id);

    const approved = await tx.menuProposal.update({
      where: { id: winner.id },
      data: { status: "APPROVED" },
      include: { items: true, proposedBy: { select: { id: true, name: true } } },
    });

    if (rejectedIds.length > 0) {
      await tx.menuProposal.updateMany({
        where: { id: { in: rejectedIds } },
        data: { status: "REJECTED" },
      });
    }

    return { approved, rejectedCount: rejectedIds.length };
  });

  return ok(result);
});
