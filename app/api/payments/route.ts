import { fromPostgrestError, notImplemented, ok, withUser } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

/** M3.2 Payment Integration (bKash / Stripe) — Miftelul Mehebub. */

// Uses cookies() for the session, so it can never be statically prerendered.
export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return fromPostgrestError(error);
  return ok({ payments: data });
});

/**
 * TODO (M3.2) — start a payment:
 *  1. Look up the expense_share being paid and take the amount FROM THE
 *     DATABASE, never from the request body. A client-supplied amount means
 *     anyone can settle a 20,000 BDT bill by posting {"amount": 1}.
 *  2. Insert a payments row with status INITIATED.
 *  3. Create the gateway session (Stripe Checkout / bKash create) with your
 *     payment id as the reference, store provider_payment_id, and return the
 *     redirect URL.
 */
export const POST = withUser(async () => notImplemented("Starting a payment"));
