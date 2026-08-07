import { badRequest, fromPostgrestError, notImplemented, ok, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** M2.1 Shared Wallet & Bill-Splitting Engine — Miftelul Mehebub. */

// Uses cookies() for the session, so it can never be statically prerendered.
export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before using the shared wallet.");

  const supabase = createClient();

  const [{ data: expenses, error }, { data: balances }] = await Promise.all([
    supabase
      .from("expenses")
      .select("*, expense_shares(*, profiles(full_name))")
      .eq("house_id", houseId)
      .order("spent_on", { ascending: false }),
    supabase.from("house_balances").select("*").eq("house_id", houseId),
  ]);

  if (error) return fromPostgrestError(error);
  return ok({ expenses, balances });
});

/**
 * TODO (M2.1) — this is the heart of the feature, so do it in two steps:
 *
 *  1. Insert the expense (house_id from getActiveHouseId, created_by: user.id).
 *  2. Insert one expense_shares row per ACTIVE house member.
 *       EQUAL  -> amount / memberCount, in paisa, distributing the remainder
 *                 across the first N members so the shares sum EXACTLY to the
 *                 total. Naive rounding loses money and the ledger never balances.
 *       CUSTOM -> take the amounts from the body and reject unless they sum to
 *                 the expense total.
 *  3. If step 2 fails, delete the expense you just created (see
 *     app/api/houses/route.ts for the same compensate-on-failure pattern).
 */
export const POST = withUser(async () => notImplemented("Adding shared expenses"));

/** TODO (M2.1): mark a share PAID/WAIVED. The DB trigger stamps settled_at. */
export const PATCH = withUser(async () => notImplemented("Settling a share"));
