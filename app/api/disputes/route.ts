import { badRequest, fromPostgrestError, notImplemented, ok, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** M3.5 Mess Court — Md. Mahidul Alam Araf. */

// Uses cookies() for the session, so it can never be statically prerendered.
export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before using the Mess Court.");

  const state = new URL(req.url).searchParams.get("state");
  const supabase = createClient();

  let query = supabase
    .from("disputes")
    .select("*, dispute_votes(*), dispute_events(*)")
    .eq("house_id", houseId);

  if (state) query = query.eq("state", state as never);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return fromPostgrestError(error);
  return ok({ disputes: data });
});

/**
 * TODO (M3.5): raise a dispute. Insert with raised_by: user.id, house_id from
 * getActiveHouseId, and state 'RAISED' — the RLS insert policy rejects any
 * other starting state, so you cannot skip straight to VOTING.
 */
export const POST = withUser(async () => notImplemented("Raising a dispute"));

/**
 * TODO (M3.5): drive the state machine. Send the target state and let the
 * database validate it — dispute_transition_allowed() raises 23514 on an
 * illegal move, which fromPostgrestError() already turns into a 400 with the
 * "Illegal Mess Court transition: X -> Y" message. Don't duplicate the rules
 * here; a second copy in TypeScript is a second copy to get out of sync.
 */
export const PATCH = withUser(async () => notImplemented("Transitioning a dispute"));
