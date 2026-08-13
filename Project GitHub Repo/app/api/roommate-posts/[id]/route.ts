import { badRequest, forbidden, notFound, ok, readJson, withUser } from "@/lib/api";
import { isHouseAdmin } from "@/lib/authz";
import { admitToHouse } from "@/lib/houses";
import { prisma } from "@/lib/prisma";
import type { JoinRequestStatus } from "@prisma/client";

type Params = { params: { id: string } };

export const dynamic = "force-dynamic";

/** Apply to take a spare seat. */
export const POST = withUser(async (user, req: Request, { params }: Params) => {
  const body = await readJson<{ message?: string }>(req);

  const post = await prisma.roommatePost.findUnique({
    where: { id: params.id },
    select: { id: true, houseId: true, isActive: true, status: true },
  });
  if (!post) return notFound("No such roommate post");
  if (!post.isActive || post.status !== "PUBLISHED") {
    return badRequest("That post is no longer accepting applicants.");
  }

  const alreadyIn = await prisma.houseMember.findFirst({
    where: { houseId: post.houseId, userId: user.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (alreadyIn) return badRequest("You already live in that house.");

  const application = await prisma.roommateApplication.create({
    data: { postId: post.id, userId: user.id, message: body?.message || null },
  });

  return ok(application, 201);
});

/** Flat admin accepts or rejects an applicant; applicant withdraws. */
export const PATCH = withUser(async (user, req: Request, { params }: Params) => {
  const body = await readJson<{ applicationId: string; status: JoinRequestStatus }>(req);
  if (!body?.applicationId || !body?.status) {
    return badRequest("applicationId and status are required");
  }

  const application = await prisma.roommateApplication.findUnique({
    where: { id: body.applicationId },
    include: { post: { select: { id: true, houseId: true } } },
  });
  if (!application || application.post.id !== params.id) {
    return notFound("No such application");
  }

  const isApplicant = application.userId === user.id;
  const runsTheFlat = await isHouseAdmin(user.id, application.post.houseId);

  if (isApplicant && body.status !== "WITHDRAWN") {
    return forbidden("As the applicant you can only withdraw.");
  }
  if (!isApplicant && !runsTheFlat) {
    return forbidden("Only the flat admin can accept or reject an applicant.");
  }

  // Accepting is what actually moves someone in, so both writes share a
  // transaction — a failure can't leave someone marked accepted but homeless.
  const updated = await prisma.$transaction(async (tx) => {
    if (body.status === "ACCEPTED") {
      await admitToHouse(tx, application.post.houseId, application.userId, "RESIDENT");
    }
    return tx.roommateApplication.update({
      where: { id: body.applicationId },
      data: { status: body.status },
    });
  });

  return ok(updated);
});

/** Take your own post down. */
export const DELETE = withUser(async (user, _req: Request, { params }: Params) => {
  const post = await prisma.roommatePost.findUnique({
    where: { id: params.id },
    select: { houseId: true, postedById: true },
  });
  if (!post) return notFound("No such roommate post");

  if (post.postedById !== user.id && !(await isHouseAdmin(user.id, post.houseId))) {
    return forbidden("Only the flat admin can take that post down.");
  }

  await prisma.roommatePost.update({ where: { id: params.id }, data: { isActive: false } });
  return ok({ id: params.id, closed: true });
});
