import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { Preference } from "@/models/Preference";
import { Listing } from "@/models/Listing";
import { Match } from "@/models/Match";
import { runStableMatching, ResidentPreference, ListingInput } from "@/lib/matching";

// Re-runs the matching engine across ALL residents with a saved preference
// profile and ALL active listings, persists the results, then returns the
// requesting user's ranked matches. In production this run would likely be
// a scheduled/background job rather than triggered per-request, but doing
// it synchronously is simplest for a capstone-scale dataset.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  await connectToDatabase();

  const [preferences, listings] = await Promise.all([
    Preference.find({}),
    Listing.find({ isActive: true }),
  ]);

  if (preferences.length === 0 || listings.length === 0) {
    return NextResponse.json({ matches: [] });
  }

  const residentInputs: ResidentPreference[] = preferences.map((p) => ({
    userId: p.userId,
    budgetMin: p.budgetMin,
    budgetMax: p.budgetMax,
    sleepSchedule: p.sleepSchedule,
    cleanliness: p.cleanliness,
    smokingOk: p.smokingOk,
    petsOk: p.petsOk,
    preferredArea: p.preferredArea,
  }));

  const listingInputs: ListingInput[] = listings.map((l) => ({
    listingId: l._id.toString(),
    rent: l.rent,
    area: l.area,
    capacity: l.capacity,
    sleepSchedule: l.sleepSchedule,
    cleanliness: l.cleanliness,
    allowsSmoking: l.allowsSmoking,
    allowsPets: l.allowsPets,
  }));

  const results = runStableMatching(residentInputs, listingInputs);

  // Persist: replace this user's previous match rows with the fresh run.
  // (We recompute for everyone above so the algorithm sees the full pool,
  // but only write rows for the requesting user to keep this endpoint cheap.)
  const userResults = results
    .filter((r) => r.userId === userId)
    .sort((a, b) => b.compatibilityScore - a.compatibilityScore);

  await Match.deleteMany({ userId });
  await Match.insertMany(
    userResults.map((r, index) => ({
      userId: r.userId,
      listingId: r.listingId,
      compatibilityScore: r.compatibilityScore,
      rank: index + 1,
    }))
  );

  const matches = await Match.find({ userId })
    .populate("listingId")
    .sort({ rank: 1 });

  const shaped = matches.map((m) => {
    const json = m.toJSON() as any;
    return {
      id: json.id,
      rank: json.rank,
      compatibilityScore: json.compatibilityScore,
      listing: json.listingId, // populated document, already transformed to {id, title, ...}
    };
  });

  return NextResponse.json({ matches: shaped });
}
