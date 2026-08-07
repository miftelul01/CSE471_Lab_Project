import { badRequest, fromPostgrestError, notImplemented, ok, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** M1.3 Guest Registration & Accountability Log — Md. Mahidul Alam Araf. */

// Uses cookies() for the session, so it can never be statically prerendered.
export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before using the guest log.");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("guest_logs")
    .select("*, profiles!guest_logs_host_user_id_fkey(full_name)")
    .eq("house_id", houseId)
    .order("checked_in_at", { ascending: false });

  if (error) return fromPostgrestError(error);
  return ok({ guests: data });
});

/**
 * TODO (M1.3):
 *  1. Validate guest_name is present; purpose and expected_check_out optional.
 *  2. Insert with house_id from getActiveHouseId and host_user_id: user.id —
 *     the RLS policy requires both to match, so neither comes from the body.
 *  3. After insert, notify the house admin and set notified_admin_at.
 */
export const POST = withUser(async () => notImplemented("Guest check-in"));

/**
 * TODO (M1.3): check-out. Update status to CHECKED_OUT and checked_out_at to
 * now(). The DB constraint rejects a check-out earlier than the check-in.
 */
export const PATCH = withUser(async () => notImplemented("Guest check-out"));
