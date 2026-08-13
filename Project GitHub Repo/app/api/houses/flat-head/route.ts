import { badRequest, forbidden, ok, readJson, withUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/**
 * Passing the flat-head role to another member.
 *
 * The rule is exactly one flat head per flat, and it is the residents' own
 * business — the sitting head chooses their successor, not the landlord, who
 * does not live there.
 *
 * Both writes go in one transaction so the flat is never briefly leaderless
 * and never briefly has two heads.
 */

export const dynamic = "force-dynamic";

export const PATCH = withUser(async (user, req: Request) => {
  const body = await readJson<{ houseId: string; toUserId: string }>(req);
  if (!body?.houseId || !body?.toUserId) {
    return badRequest("houseId and toUserId are required");
  }

  const me = await prisma.houseMember.findUnique({
    where: { houseId_userId: { houseId: body.houseId, userId: user.id } },
    select: { isHouseAdmin: true, role: true, status: true },
  });

  if (!me || me.status !== "ACTIVE" || !me.isHouseAdmin || me.role !== "RESIDENT") {
    return forbidden("Only the current flat head can pass the role on.");
  }
  if (body.toUserId === user.id) {
    return badRequest("You already are the flat head.");
  }

  const successor = await prisma.houseMember.findUnique({
    where: { houseId_userId: { houseId: body.houseId, userId: body.toUserId } },
    select: { status: true, role: true },
  });

  if (!successor || successor.status !== "ACTIVE") {
    return badRequest("That person doesn't live in this flat.");
  }
  if (successor.role !== "RESIDENT") {
    return badRequest("The flat head has to be someone who lives here.");
  }

  await prisma.$transaction([
    prisma.houseMember.update({
      where: { houseId_userId: { houseId: body.houseId, userId: user.id } },
      data: { isHouseAdmin: false },
    }),
    prisma.houseMember.update({
      where: { houseId_userId: { houseId: body.houseId, userId: body.toUserId } },
      data: { isHouseAdmin: true },
    }),
  ]);

  return ok({ houseId: body.houseId, flatHead: body.toUserId });
});
