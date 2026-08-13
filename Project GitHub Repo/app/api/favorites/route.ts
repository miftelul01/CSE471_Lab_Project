import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/** M1.2 — saved listings (Mahia Tanzin). Private to their owner. */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id },
    include: { listing: true },
    orderBy: { createdAt: "desc" },
  });
  return ok({ favorites });
});

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<{ listing_id: string }>(req);
  if (!body?.listing_id) return badRequest("listing_id is required");

  // Saving twice is a no-op rather than a 400 — that's what the star button
  // in the UI actually means.
  const favorite = await prisma.favorite.upsert({
    where: { userId_listingId: { userId: user.id, listingId: body.listing_id } },
    create: { userId: user.id, listingId: body.listing_id },
    update: {},
  });
  return ok(favorite, 201);
});

export const DELETE = withUser(async (user, req: Request) => {
  const listingId = new URL(req.url).searchParams.get("listing_id");
  if (!listingId) return badRequest("listing_id query parameter is required");

  await prisma.favorite.deleteMany({ where: { userId: user.id, listingId } });
  return ok({ removed: true });
});
