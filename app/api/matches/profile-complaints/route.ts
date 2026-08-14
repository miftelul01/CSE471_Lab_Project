import { badRequest, missingFields, ok, readJson, withUser } from "@/lib/api";
import { isVerificationWindowOpen } from "@/lib/moveIn";
import { prisma } from "@/lib/prisma";

/**
 * M1.2 — Post-Move-In Feedback Window, direct dispute routing (Mahia Tanzin).
 *
 * Creates a Dispute (Araf's M3.5 Mess Court model — no schema change there)
 * tagged category "PROFILE_DISHONESTY", state RAISED. Complaints reaching
 * here have already been validated as: the complainant is an existing
 * housemate (joined before the subject), the subject's 14-day verification
 * window is still open. An admin later marks it upheld (with a rating
 * penalty) or dismissed — see PATCH /api/admin/disputes/uphold.
 */

export const dynamic = "force-dynamic";

type ComplaintBody = { subjectUserId: string; title: string; description: string };

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<ComplaintBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["subjectUserId", "title", "description"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  if (body.subjectUserId === user.id) return badRequest("You can't file a complaint against yourself.");

  const [complainantMembership, subjectMembership] = await Promise.all([
    prisma.houseMember.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      select: { houseId: true, joinedAt: true },
    }),
    prisma.houseMember.findFirst({
      where: { userId: body.subjectUserId, status: "ACTIVE" },
      select: { houseId: true, joinedAt: true },
    }),
  ]);

  if (!complainantMembership) return badRequest("Join a house before filing a complaint.");
  if (!subjectMembership || subjectMembership.houseId !== complainantMembership.houseId) {
    return badRequest("You can only file this about a current housemate.");
  }
  if (complainantMembership.joinedAt >= subjectMembership.joinedAt) {
    return badRequest("Only housemates who were already living there before this person moved in can file this.");
  }
  if (!isVerificationWindowOpen(subjectMembership.joinedAt)) {
    return badRequest("The 14-day verification window for this housemate has closed.");
  }

  const dispute = await prisma.dispute.create({
    data: {
      houseId: complainantMembership.houseId,
      raisedById: user.id,
      againstUserId: body.subjectUserId,
      title: body.title,
      description: body.description,
      category: "PROFILE_DISHONESTY",
      state: "RAISED",
    },
  });

  return ok(dispute, 201);
});
