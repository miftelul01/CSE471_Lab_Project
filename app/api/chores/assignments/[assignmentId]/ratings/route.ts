import { badRequest, forbidden, notFound, ok, readJson, withUser } from "@/lib/api";
import { isHouseMember } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

/**
 * M3.4 enhancement E — optional, anonymous 1-5 quality rating on a
 * completed assignment. Gated on House.choreQualityRatingEnabled (off by
 * default). "Anonymous" is presentation-only: userId is stored to enforce
 * one rating per person and block self-rating (@@unique([assignmentId,
 * userId]) on the model), but this route intentionally has no matching GET
 * for individual ratings — only the aggregate exposed via GET /api/chores.
 */

export const dynamic = "force-dynamic";

export const POST = withUser(async (user, req: Request, { params }: { params: { assignmentId: string } }) => {
  const body = await readJson<{ score: number }>(req);
  if (typeof body?.score !== "number" || !Number.isInteger(body.score) || body.score < 1 || body.score > 5) {
    return badRequest("score must be a whole number from 1 to 5.");
  }

  const assignment = await prisma.choreAssignment.findUnique({
    where: { id: params.assignmentId },
    select: { id: true, userId: true, status: true, chore: { select: { houseId: true } } },
  });
  if (!assignment) return notFound("No such assignment");

  const houseId = assignment.chore.houseId;
  if (!(await isHouseMember(user.id, houseId))) return forbidden("You're not a member of this house.");

  const house = await prisma.house.findUnique({ where: { id: houseId }, select: { choreQualityRatingEnabled: true } });
  if (!house?.choreQualityRatingEnabled) {
    return badRequest("Quality ratings aren't turned on for this house.");
  }
  if (assignment.status !== "COMPLETED") return badRequest("Only a completed chore can be rated.");
  if (assignment.userId === user.id) return badRequest("You can't rate your own chore.");

  const rating = await prisma.choreQualityRating.upsert({
    where: { assignmentId_userId: { assignmentId: assignment.id, userId: user.id } },
    create: { assignmentId: assignment.id, userId: user.id, score: body.score },
    update: { score: body.score },
  });

  return ok({ id: rating.id, score: rating.score }, 201);
});
