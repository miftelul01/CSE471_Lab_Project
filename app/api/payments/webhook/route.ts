import { NextResponse } from "next/server";

/**
 * M3.2 Payment gateway webhook — Miftelul Mehebub.
 *
 * Deliberately NOT wrapped in withUser(): the gateway calls this server-to-
 * server with no session. That is exactly why the signature check below is not
 * optional — without it, anyone who finds this URL can mark any bill paid.
 *
 * TODO:
 *  1. Read the RAW body (await req.text(), not req.json()) — signature
 *     verification hashes the exact bytes, so parsing first breaks it.
 *  2. Verify the signature: Stripe's `stripe-signature` header against
 *     STRIPE_WEBHOOK_SECRET, or bKash's query/execute confirmation.
 *     Return 400 and stop if it doesn't match.
 *  3. Find the payment by provider_payment_id and set status to SUCCEEDED or
 *     FAILED using createAdminClient() from lib/supabase/admin.ts.
 *  4. Do nothing about expense_shares — the payments_apply_to_ledger trigger
 *     marks the share PAID as soon as the payment succeeds.
 *  5. Be idempotent: gateways retry. The unique index on
 *     (provider, provider_payment_id) plus the "already SUCCEEDED" check in
 *     the trigger keep a replay from double-crediting.
 *  6. Always return 200 once handled, or the gateway will keep retrying.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Payment webhook is not built yet — see the TODO in this route handler." },
    { status: 501 }
  );
}
