import { ok, withUser } from "@/lib/api";
import { runStableMatching, type ListingInput, type ResidentPreference } from "@/lib/matching";
import { prisma } from "@/lib/prisma";

/**
 * M1.2 — run the matching engine and return this user's ranked matches
 * (Mahia Tanzin).
 *
 * Stable matching is a POOL-WIDE computation: to know whether you get your
 * top-choice listing, the algorithm has to see every other applicant competing
 * for the same rooms. It therefore reads every preference row server-side.
 * Nothing about other applicants is ever returned — only the requesting user's
 * own matches are persisted and sent back.
 *
 * Under Supabase this needed the service-role client to get past RLS. Prisma
 * has no per-user filtering to bypass, which means the "only ever return my
 * own rows" discipline below is now the only thing keeping the rest private.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const [preferences, listings] = await Promise.all([
    prisma.preference.findMany(),
    prisma.listing.findMany({ where: { isActive: true } }),
  ]);

  if (preferences.length === 0 || listings.length === 0) return ok({ matches: [] });

  const residentInputs: ResidentPreference[] = preferences.map((p) => ({
    userId: p.userId,
    budgetMin: Number(p.budgetMin),
    budgetMax: Number(p.budgetMax),
    sleepSchedule: p.sleepSchedule,
    cleanliness: p.cleanliness,
    smokingOk: p.smokingOk,
    petsOk: p.petsOk,
    preferredArea: p.preferredArea,
  }));

  const listingInputs: ListingInput[] = listings.map((l) => ({
    listingId: l.id,
    rent: Number(l.rent),
    area: l.area,
    capacity: l.capacity,
    sleepSchedule: l.sleepSchedule ?? undefined,
    cleanliness: l.cleanliness ?? undefined,
    allowsSmoking: l.allowsSmoking ?? undefined,
    allowsPets: l.allowsPets ?? undefined,
  }));

  const results = runStableMatching(residentInputs, listingInputs);
  const mine = results
    .filter((r) => r.userId === user.id)
    .sort((a, b) => b.compatibilityScore - a.compatibilityScore);

  // Replace this user's cached matches with the fresh run, atomically — a
  // failure part-way would otherwise leave them with no matches at all.
  await prisma.$transaction([
    prisma.match.deleteMany({ where: { userId: user.id } }),
    prisma.match.createMany({
      data: mine.map((r, index) => ({
        userId: user.id,
        listingId: r.listingId,
        compatibilityScore: r.compatibilityScore,
        rank: index + 1,
      })),
    }),
  ]);

  const matches = await prisma.match.findMany({
    where: { userId: user.id },
    include: { listing: true },
    orderBy: { rank: "asc" },
  });

  return ok({ matches });
});
