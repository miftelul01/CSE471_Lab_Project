import { badRequest, fromPostgrestError, notImplemented, ok, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** M3.4 Automated Chore Rotation — Mahia Tanzin. */

// Uses cookies() for the session, so it can never be statically prerendered.
export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before setting up chores.");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("chores")
    .select("*, chore_assignments(*, profiles(full_name))")
    .eq("house_id", houseId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) return fromPostgrestError(error);
  return ok({ chores: data });
});

/**
 * TODO (M3.4): create a chore. rotation_order is an ordered array of profile
 * ids — default it to the house's active members. Only house admins may write
 * here (RLS enforces it).
 */
export const POST = withUser(async () => notImplemented("Creating chores"));

/** TODO (M3.4): mark an assignment COMPLETED (assignee or house admin). */
export const PATCH = withUser(async () => notImplemented("Completing a chore"));
