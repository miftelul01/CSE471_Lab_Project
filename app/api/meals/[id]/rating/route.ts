import { badRequest, notFound, ok, readJson, withUser } from "@/lib/api";
import { assertHouseMember } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string } };

/**
 * M2.2 — Post-Meal Satisfaction Rating (scoped enhancement, Mahia Tanzin).
 * A resident may rate a meal only once it has actually happened.
 */

export const dynamic = "force-dynamic";

export const POST = withUser(async (user, req: Request, { params }: Params) => {
  const meal = await prisma.meal.findUnique({
    where: { id: params.id },
    select: { id: true, houseId: true, locksAt: true },
  });
  if (!meal) return notFound("No such meal");
  await assertHouseMember(user, meal.houseId);

  if (!meal.locksAt || meal.locksAt.getTime() > Date.now()) {
    return badRequest("You can rate a meal only after it has happened.");
  }

  const body = await readJson<{ stars: number }>(req);
  if (typeof body?.stars !== "number" || !Number.isInteger(body.stars) || body.stars < 1 || body.stars > 5) {
    return badRequest("stars must be a whole number from 1 to 5.");
  }

  const rating = await prisma.mealRating.upsert({
    where: { mealId_userId: { mealId: meal.id, userId: user.id } },
    create: { mealId: meal.id, userId: user.id, stars: body.stars },
    update: { stars: body.stars },
  });
  return ok(rating, 201);
});
