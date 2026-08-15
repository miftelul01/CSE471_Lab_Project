import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { admitToHouse } from "@/lib/houses";
import { prisma } from "@/lib/prisma";

/**
 * Request to join a house by id.
 *
 * Anyone signed in can discover a house id (it's returned alongside every
 * listing), so knowing the id is not proof of a real connection to that
 * household. This creates the membership as PENDING rather than ACTIVE —
 * every house-scoped query (expenses, meals, disputes, guests, ...) filters
 * on status ACTIVE, so a pending row grants no access to anything until a
 * house admin promotes it. There's no admin-facing approval UI yet; for now
 * that promotion happens the same way granting ADMIN does — directly in
 * Prisma Studio or psql.
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

  // Answered here rather than left to admitToHouse so the caller gets told
  // what happened. Submitting your own house id is an easy mistake — the id is
  // printed on the Houses page for sharing — and it used to demote the sender
  // to PENDING, locking them out of their own household.
  const existing = await prisma.houseMember.findUnique({
    where: { houseId_userId: { houseId: house.id, userId: user.id } },
    select: { status: true },
  });
  if (existing?.status === "ACTIVE") {
    return badRequest("You're already a member of that house.");
  }
  if (existing?.status === "PENDING") {
    return badRequest("You've already asked to join that house — it's waiting on a house admin.");
  }

  const membership = await prisma.$transaction((tx) =>
    admitToHouse(tx, house.id, user.id, user.profile.role, "PENDING")
  );

  return ok(membership, 201);
});
