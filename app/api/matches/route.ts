import { ok, withUser } from "@/lib/api";
import {
  aggregateHousePreferences,
  computeCompatibilityScore,
  runStableMatching,
  type ListingInput,
  type ResidentPreference,
} from "@/lib/matching";
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
 * User <-> House (Group Matching): a listing attached to a house with active
 * residents is scored against the LIVE AVERAGE of those residents'
 * preferences, not just the listing's own static fields — see
 * aggregateHousePreferences in lib/matching.ts. Falls back to the listing's
 * stated fields for a house with no residents yet (or no listing/house at
 * all, e.g. a standalone room).
 *
 * Under Supabase this needed the service-role client to get past RLS. Prisma
 * has no per-user filtering to bypass, which means the "only ever return my
 * own rows" discipline below is now the only thing keeping the rest private.
 */

export const dynamic = "force-dynamic";

function toResidentInput(p: {
  userId: string;
  budgetMin: unknown;
  budgetMax: unknown;
  sleepSchedule: ResidentPreference["sleepSchedule"];
  cleanlinessLevel: number;
  noiseTolerance: number;
  guestPolicy: ResidentPreference["guestPolicy"];
  smokingOk: boolean;
  petsOk: boolean;
  preferredArea: string | null;
  budgetWeight: ResidentPreference["budgetWeight"];
  sleepWeight: ResidentPreference["sleepWeight"];
  cleanlinessWeight: ResidentPreference["cleanlinessWeight"];
  noiseWeight: ResidentPreference["noiseWeight"];
  guestWeight: ResidentPreference["guestWeight"];
  smokingWeight: ResidentPreference["smokingWeight"];
  petsWeight: ResidentPreference["petsWeight"];
  matchRatingPenalty?: number;
}): ResidentPreference {
  return {
    userId: p.userId,
    budgetMin: Number(p.budgetMin),
    budgetMax: Number(p.budgetMax),
    sleepSchedule: p.sleepSchedule,
    cleanlinessLevel: p.cleanlinessLevel,
    noiseTolerance: p.noiseTolerance,
    guestPolicy: p.guestPolicy,
    smokingOk: p.smokingOk,
    petsOk: p.petsOk,
    preferredArea: p.preferredArea,
    budgetWeight: p.budgetWeight,
    sleepWeight: p.sleepWeight,
    cleanlinessWeight: p.cleanlinessWeight,
    noiseWeight: p.noiseWeight,
    guestWeight: p.guestWeight,
    smokingWeight: p.smokingWeight,
    petsWeight: p.petsWeight,
    matchRatingPenalty: p.matchRatingPenalty,
  };
}

export const GET = withUser(async (user) => {
  const [preferences, allListings, blocks] = await Promise.all([
    prisma.preference.findMany({ include: { user: { select: { matchRatingPenalty: true } } } }),
    prisma.listing.findMany({ where: { isActive: true } }),
    prisma.userBlock.findMany({
      where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
      select: { blockerId: true, blockedId: true },
    }),
  ]);

  // Report & Block safety system: a listing from a landlord I've blocked (or
  // who has blocked me) is excluded from matching entirely.
  const blockedUserIds = new Set(blocks.map((b) => (b.blockerId === user.id ? b.blockedId : b.blockerId)));
  const listings = allListings.filter((l) => !blockedUserIds.has(l.landlordId));

  if (preferences.length === 0 || listings.length === 0) return ok({ matches: [] });

  const residentInputs: ResidentPreference[] = preferences.map((p) =>
    toResidentInput({ ...p, matchRatingPenalty: p.user.matchRatingPenalty })
  );
  const residentByUserId = new Map(residentInputs.map((r) => [r.userId, r]));

  // Live house aggregates: for every house with active residents who have a
  // preference set, average their lifestyle fields instead of trusting the
  // listing's static ones.
  const houseIds = [...new Set(listings.map((l) => l.houseId).filter((id): id is string => !!id))];
  const memberships =
    houseIds.length > 0
      ? await prisma.houseMember.findMany({
          where: { houseId: { in: houseIds }, status: "ACTIVE" },
          select: { houseId: true, userId: true },
        })
      : [];
  const aggregateByHouseId = new Map<string, ReturnType<typeof aggregateHousePreferences>>();
  for (const houseId of houseIds) {
    const residentPrefs = memberships
      .filter((m) => m.houseId === houseId)
      .map((m) => residentByUserId.get(m.userId))
      .filter((r): r is ResidentPreference => !!r);
    aggregateByHouseId.set(houseId, aggregateHousePreferences(residentPrefs));
  }

  const listingInputs: ListingInput[] = listings.map((l) => {
    const aggregate = l.houseId ? aggregateByHouseId.get(l.houseId) : null;
    return {
      listingId: l.id,
      rent: Number(l.rent),
      area: l.area,
      capacity: l.capacity,
      sleepSchedule: aggregate?.sleepSchedule ?? l.sleepSchedule ?? undefined,
      cleanlinessLevel: aggregate?.cleanlinessLevel ?? l.cleanlinessLevel ?? undefined,
      noiseTolerance: aggregate?.noiseTolerance, // no per-listing noise field — group aggregate only
      guestPolicy: aggregate?.guestPolicy, // no per-listing guest-policy field — group aggregate only
      allowsSmoking: aggregate?.allowsSmoking ?? l.allowsSmoking ?? undefined,
      allowsPets: aggregate?.allowsPets ?? l.allowsPets ?? undefined,
    };
  });
  const listingByListingId = new Map(listingInputs.map((l) => [l.listingId, l]));

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

  // Match Score Transparency Breakdown: recomputed live for the response
  // rather than stored, so it always reflects the current scoring engine.
  const myResident = residentByUserId.get(user.id);
  const withBreakdown = matches.map((m) => {
    const listingInput = listingByListingId.get(m.listingId);
    const breakdown = myResident && listingInput ? computeCompatibilityScore(myResident, listingInput) : null;
    return { ...m, breakdown: breakdown?.breakdown ?? [], summary: breakdown?.summary ?? "" };
  });

  return ok({ matches: withBreakdown });
});
