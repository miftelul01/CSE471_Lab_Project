import { badRequest, notFound, ok, readJson, withUser } from "@/lib/api";
import {
  findNewMatchesForSearch,
  validateSavedSearchInput,
  type SavedSearchInput,
} from "@/lib/mapListings";
import type { RouteProfile } from "@/lib/neighborhood";
import { prisma } from "@/lib/prisma";

/**
 * M3.3 — Saved search radius alerts. No notification system exists anywhere
 * in this app, so "alert me to new matches" is computed live on each visit
 * (lib/mapListings.ts findNewMatchesForSearch), the same lazy-evaluation
 * pattern as lib/joinRequests.ts / lib/menu.ts, rather than pushed.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const searches = await prisma.savedCommuteSearch.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  // Matches are computed against the OLD lastViewedAt (so this load still
  // shows everything new since last time), then the watermark bumps forward
  // for the NEXT load — same "sweep on read" idea as expireStalePending.
  const now = new Date();
  const withMatches = await Promise.all(
    searches.map(async (s) => ({
      ...s,
      // `mode` is a plain string column, but every row was written through
      // validateSavedSearchInput, which only accepts the two RouteProfile
      // values — the cast just recovers that guarantee for the type checker.
      newMatches: await findNewMatchesForSearch({ ...s, mode: s.mode as RouteProfile }),
    }))
  );
  await prisma.savedCommuteSearch.updateMany({
    where: { id: { in: searches.map((s) => s.id) } },
    data: { lastViewedAt: now },
  });

  return ok({ searches: withMatches });
});

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<SavedSearchInput>(req);
  if (!body) return badRequest("Invalid JSON body");

  const validationError = validateSavedSearchInput(body);
  if (validationError) return badRequest(validationError);

  const search = await prisma.savedCommuteSearch.create({
    data: {
      userId: user.id,
      label: body.label.trim(),
      originAddress: body.originAddress.trim(),
      originLat: body.originLat,
      originLng: body.originLng,
      maxCommuteMinutes: body.maxCommuteMinutes,
      mode: body.mode,
    },
  });

  return ok(search, 201);
});

export const DELETE = withUser(async (user, req: Request) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id query parameter is required");

  const search = await prisma.savedCommuteSearch.findUnique({ where: { id }, select: { userId: true } });
  if (!search || search.userId !== user.id) return notFound("No such saved search");

  await prisma.savedCommuteSearch.delete({ where: { id } });
  return ok({ removed: true });
});
