import { fromPostgrestError, ok, withUser } from "@/lib/api";
import { runStableMatching, type ListingInput, type ResidentPreference } from "@/lib/matching";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Uses cookies() for the session, so it can never be statically prerendered.
export const dynamic = "force-dynamic";

/**
 * M1.2 — run the matching engine and return this user's ranked matches
 * (Mahia Tanzin).
 *
 * Why the admin client: stable matching is a POOL-WIDE computation. To know
 * whether you get your top-choice listing, the algorithm has to see every
 * other applicant competing for the same rooms. RLS (correctly) hides other
 * people's preference rows from you, so the read runs with the service role
 * server-side. Nothing about other applicants is ever returned — only the
 * requesting user's own matches are persisted and sent back.
 *
 * At capstone scale, running this per-request is fine. In production it would
 * be a scheduled job that recomputes for everyone at once.
 */
export const GET = withUser(async (user) => {
  const supabase = createClient();
  const admin = createAdminClient();

  const [{ data: preferences }, { data: listings }] = await Promise.all([
    admin.from("preferences").select("*"),
    admin.from("listings").select("*").eq("is_active", true),
  ]);

  if (!preferences?.length || !listings?.length) {
    return ok({ matches: [] });
  }

  const residentInputs: ResidentPreference[] = preferences.map((p) => ({
    userId: p.user_id,
    budgetMin: Number(p.budget_min),
    budgetMax: Number(p.budget_max),
    sleepSchedule: p.sleep_schedule,
    cleanliness: p.cleanliness,
    smokingOk: p.smoking_ok,
    petsOk: p.pets_ok,
    preferredArea: p.preferred_area,
  }));

  const listingInputs: ListingInput[] = listings.map((l) => ({
    listingId: l.id,
    rent: Number(l.rent),
    area: l.area,
    capacity: l.capacity,
    sleepSchedule: l.sleep_schedule ?? undefined,
    cleanliness: l.cleanliness ?? undefined,
    allowsSmoking: l.allows_smoking ?? undefined,
    allowsPets: l.allows_pets ?? undefined,
  }));

  const results = runStableMatching(residentInputs, listingInputs);

  const mine = results
    .filter((r) => r.userId === user.id)
    .sort((a, b) => b.compatibilityScore - a.compatibilityScore);

  // Replace this user's cached matches with the fresh run. Both statements go
  // through the user client, so RLS still guarantees we only touch our rows.
  const { error: deleteError } = await supabase.from("matches").delete().eq("user_id", user.id);
  if (deleteError) return fromPostgrestError(deleteError);

  if (mine.length > 0) {
    const { error: insertError } = await supabase.from("matches").insert(
      mine.map((r, index) => ({
        user_id: user.id,
        listing_id: r.listingId,
        compatibility_score: r.compatibilityScore,
        rank: index + 1,
      }))
    );
    if (insertError) return fromPostgrestError(insertError);
  }

  const { data, error } = await supabase
    .from("matches")
    .select("*, listings(*)")
    .eq("user_id", user.id)
    .order("rank", { ascending: true });

  if (error) return fromPostgrestError(error);
  return ok({ matches: data });
});
