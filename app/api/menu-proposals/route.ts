import { badRequest, fromPostgrestError, notImplemented, ok, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** M2.2 Weekly Menu Proposal & Voting System — Mahia Tanzin. */

// Uses cookies() for the session, so it can never be statically prerendered.
export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before proposing menus.");

  const week = new URL(req.url).searchParams.get("week_start_date");
  const supabase = createClient();

  let query = supabase
    .from("menu_proposals")
    .select("*, menu_proposal_items(*), menu_votes(*)")
    .eq("house_id", houseId);

  if (week) query = query.eq("week_start_date", week);

  const { data, error } = await query.order("week_start_date", { ascending: false });
  if (error) return fromPostgrestError(error);
  return ok({ proposals: data });
});

/**
 * TODO (M2.2):
 *  1. Validate title and week_start_date (normalise it to the Monday of that
 *     week, or the "one approved menu per week" index won't line up).
 *  2. Insert the proposal with proposed_by: user.id and house_id from
 *     getActiveHouseId, then insert its menu_proposal_items rows.
 *  3. Set voting_closes_at so the UI can show a countdown.
 */
export const POST = withUser(async () => notImplemented("Proposing a weekly menu"));

/**
 * TODO (M2.2): close voting. Tally menu_votes per proposal for the week, set
 * the winner to APPROVED and the others to REJECTED. Only the proposer or a
 * house admin may do this (the RLS update policy already enforces it).
 */
export const PATCH = withUser(async () => notImplemented("Closing menu voting"));
