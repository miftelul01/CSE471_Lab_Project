import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/**
 * Join a house by id.
 *
 * Auto-approved (status ACTIVE) to keep the demo flow short. For landlord
 * approval, create with status PENDING and let the house admin flip it.
 */

export const dynamic = "force-dynamic";

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<{ house_id: string }>(req);
  if (!body?.house_id) return badRequest("house_id is required");

  const house = await prisma.house.findUnique({
    where: { id: body.house_id },
    select: { id: true },
  });
  if (!house) return badRequest("No house exists with that id.");

  const membership = await prisma.houseMember.upsert({
    where: { houseId_userId: { houseId: house.id, userId: user.id } },
    create: { houseId: house.id, userId: user.id, role: user.profile.role, status: "ACTIVE" },
    update: { status: "ACTIVE" },
  });

  return ok(membership, 201);
});
