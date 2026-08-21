import { badRequest, notFound, ok, readJson, withUser } from "@/lib/api";
import { assertHouseMember, AuthzError, isPlatformAdmin } from "@/lib/authz";
import { canEditProposal, validateDayProposalInput, type DayProposalInput } from "@/lib/menu";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string } };

/** M2.2 — edit or withdraw a resident's own day candidate (Mahia Tanzin). */

export const dynamic = "force-dynamic";

type PatchBody = Partial<DayProposalInput> & { withdraw?: boolean };

export const PATCH = withUser(async (user, req: Request, { params }: Params) => {
  const proposal = await prisma.dayProposal.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      houseId: true,
      proposedById: true,
      weekStartDate: true,
      dayOfWeek: true,
      withdrawnAt: true,
    },
  });
  if (!proposal) return notFound("No such candidate");
  await assertHouseMember(user, proposal.houseId);
  if (proposal.proposedById !== user.id && !isPlatformAdmin(user)) {
    throw new AuthzError("Only the proposer can change this candidate.");
  }
  if (proposal.withdrawnAt) return badRequest("This candidate has already been withdrawn.");

  const body = await readJson<PatchBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  if (body.withdraw) {
    // Withdrawal is allowed anytime before that day's vote is finalized —
    // any ballots already cast for it gracefully fall through to voters'
    // next ranked choice (see tallyIRV), rather than corrupting the tally.
    const result = await prisma.dailyMealResult.findUnique({
      where: {
        houseId_weekStartDate_dayOfWeek: {
          houseId: proposal.houseId,
          weekStartDate: proposal.weekStartDate,
          dayOfWeek: proposal.dayOfWeek,
        },
      },
      select: { status: true },
    });
    if (result && (result.status === "DECIDED" || result.status === "FALLBACK")) {
      return badRequest("This day's vote is already finalized — withdrawing now would have no effect.");
    }
    const updated = await prisma.dayProposal.update({
      where: { id: proposal.id },
      data: { withdrawnAt: new Date() },
    });
    return ok(updated);
  }

  // Editing (not withdrawing) is only allowed before that week's voting opens.
  if (!canEditProposal(proposal.weekStartDate)) {
    return badRequest("Voting has already opened for this day — you can only withdraw now, not edit.");
  }

  const validationError = validateDayProposalInput({ ...body, dayOfWeek: proposal.dayOfWeek });
  if (validationError) return badRequest(validationError);

  const updated = await prisma.dayProposal.update({
    where: { id: proposal.id },
    data: {
      breakfast: body.breakfast?.trim() || null,
      lunch: body.lunch?.trim() || null,
      dinner: body.dinner?.trim() || null,
      estimatedCostPerHead:
        body.estimatedCostPerHead != null && body.estimatedCostPerHead !== "" ? Number(body.estimatedCostPerHead) : null,
      nutritionProfile: body.nutritionProfile ?? null,
      dietaryTags: body.dietaryTags ?? [],
    },
  });
  return ok(updated);
});
