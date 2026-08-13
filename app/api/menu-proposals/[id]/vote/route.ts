import { badRequest, notFound, ok, readJson, withUser } from "@/lib/api";
import { assertHouseMember } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string } };

/**
 * M2.2 Weekly Menu Proposal & Voting System — Mahia Tanzin.
 *
 * Upserts on (proposal_id, user_id) — the unique index this relies on — so a
 * second vote from the same person REPLACES the first instead of erroring.
 * The `vote IN (-1, 1)` check constraint is the last line of defense; we
 * still validate here first so a bad value gets a readable 400 instead of a
 * raw Postgres error.
 */

export const dynamic = "force-dynamic";

export const POST = withUser(async (user, req: Request, { params }: Params) => {
  const body = await readJson<{ vote: number }>(req);
  if (!body || (body.vote !== 1 && body.vote !== -1)) {
    return badRequest("vote must be 1 (up) or -1 (down).");
  }

  const proposal = await prisma.menuProposal.findUnique({
    where: { id: params.id },
    select: { houseId: true, status: true },
  });
  if (!proposal) return notFound("No such menu proposal");

  await assertHouseMember(user, proposal.houseId);

  if (proposal.status !== "OPEN") {
    return badRequest("Voting is closed for this proposal.");
  }

  await prisma.menuVote.upsert({
    where: { proposalId_userId: { proposalId: params.id, userId: user.id } },
    create: { proposalId: params.id, userId: user.id, vote: body.vote },
    update: { vote: body.vote },
  });

  const votes = await prisma.menuVote.findMany({
    where: { proposalId: params.id },
    select: { vote: true },
  });
  const score = votes.reduce((sum, v) => sum + v.vote, 0);
  const upvotes = votes.filter((v) => v.vote === 1).length;
  const downvotes = votes.filter((v) => v.vote === -1).length;

  return ok({ score, upvotes, downvotes, myVote: body.vote });
});
