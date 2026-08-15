import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/**
 * M1.2 — Report & Block Safety System, blocking half (Mahia Tanzin).
 * Blocked users are excluded bidirectionally from /api/matches/people and
 * from listing-based /api/matches (their listings, if they're a landlord).
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const blocks = await prisma.userBlock.findMany({
    where: { blockerId: user.id },
    include: { blocked: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  return ok({ blocks });
});

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<{ user_id: string }>(req);
  if (!body?.user_id) return badRequest("user_id is required");
  if (body.user_id === user.id) return badRequest("You can't block yourself.");

  const block = await prisma.userBlock.upsert({
    where: { blockerId_blockedId: { blockerId: user.id, blockedId: body.user_id } },
    create: { blockerId: user.id, blockedId: body.user_id },
    update: {},
  });
  return ok(block, 201);
});

export const DELETE = withUser(async (user, req: Request) => {
  const userId = new URL(req.url).searchParams.get("user_id");
  if (!userId) return badRequest("user_id query parameter is required");

  await prisma.userBlock.deleteMany({ where: { blockerId: user.id, blockedId: userId } });
  return ok({ removed: true });
});
