import { NextResponse } from "next/server";

import { verifyInternalSignature, verifyStripeSignature } from "@/lib/payments";
import { prisma } from "@/lib/prisma";

/**
 * M3.2 Payment gateway webhook — Miftelul Mehebub.
 *
 * Deliberately NOT wrapped in withUser(): the gateway calls this server-to-
 * server with no session. That is exactly why the signature check below is not
 * optional — without it, anyone who finds this URL can mark any bill paid.
 *
 * This route is the ONLY place a payment may reach SUCCEEDED. The browser
 * cannot do it (there is no PATCH on /api/payments), and the sandbox confirm
 * page cannot either — it comes back through here and gets verified like any
 * other caller.
 *
 * What this route must never do is touch expense_shares. The
 * payments_apply_to_ledger trigger marks the share PAID the moment the payment
 * succeeds, and it fires on UPDATE — which is why the row was inserted as
 * INITIATED and is updated here rather than being created in its final state.
 */

export const dynamic = "force-dynamic";

type StripeEvent = {
  type?: string;
  data?: { object?: { id?: string; metadata?: { payment_id?: string } } };
};

/**
 * An event this server raised about itself: the sandbox's confirm button, the
 * bKash callback once execute came back Completed, or a confirmed cash
 * handover. All three are signed with the app's own secret, which is why they
 * come through the same door as Stripe rather than each writing SUCCEEDED
 * somewhere of its own.
 */
type InternalEvent = {
  paymentId?: string;
  outcome?: "SUCCEEDED" | "FAILED";
  /** The gateway's own reference, when there was a gateway. */
  providerPaymentId?: string;
};

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(req: Request) {
  // The RAW bytes, not req.json(). Signature verification hashes exactly what
  // was sent, and re-serialising a parsed object changes key order and spacing.
  const rawBody = await req.text();

  const stripeSignature = req.headers.get("stripe-signature");
  const internalSignature = req.headers.get("x-internal-signature");

  let paymentId: string | null = null;
  let providerPaymentId: string | null = null;
  let outcome: "SUCCEEDED" | "FAILED" = "SUCCEEDED";

  // Dispatch on which signature ARRIVED, not on which gateway is configured.
  // Keying this off hasRealGateway() meant that the moment a Stripe key
  // existed, every internally-signed event — bKash settling, cash being
  // confirmed — was rejected for want of a stripe-signature it was never going
  // to have. Both kinds are verified; neither is trusted for being first.
  if (stripeSignature) {
    if (!verifyStripeSignature(rawBody, stripeSignature)) {
      return bad("Invalid signature.");
    }

    let event: StripeEvent;
    try {
      event = JSON.parse(rawBody) as StripeEvent;
    } catch {
      return bad("Malformed event body.");
    }

    // Anything that is not a completed checkout is acknowledged and ignored —
    // returning non-200 would make Stripe retry an event we simply don't want.
    if (event.type !== "checkout.session.completed") {
      return NextResponse.json({ received: true, ignored: event.type ?? "unknown" });
    }

    paymentId = event.data?.object?.metadata?.payment_id ?? null;
    providerPaymentId = event.data?.object?.id ?? null;
  } else {
    if (!internalSignature || !verifyInternalSignature(rawBody, internalSignature)) {
      return bad("Invalid signature.");
    }

    let event: InternalEvent;
    try {
      event = JSON.parse(rawBody) as InternalEvent;
    } catch {
      return bad("Malformed event body.");
    }

    paymentId = event.paymentId ?? null;
    providerPaymentId = event.providerPaymentId ?? null;
    outcome = event.outcome === "FAILED" ? "FAILED" : "SUCCEEDED";
  }

  if (!paymentId && !providerPaymentId) return bad("Event identified no payment.");

  const payment = await prisma.payment.findFirst({
    where: paymentId ? { id: paymentId } : { providerPaymentId: providerPaymentId! },
    select: { id: true, status: true, expenseShareId: true },
  });

  // A 200 for an unknown id on purpose: a gateway that keeps retrying because
  // of a row we will never have is noise, not a problem we can fix.
  if (!payment) return NextResponse.json({ received: true, matched: false });

  // Idempotency. Gateways retry, and a replayed "succeeded" must not re-run the
  // ledger trigger. The trigger itself also guards on OLD.status IS DISTINCT
  // FROM 'SUCCEEDED', so this is the second of two locks, not the only one.
  if (payment.status === "SUCCEEDED") {
    return NextResponse.json({ received: true, alreadyApplied: true });
  }

  /**
   * One bill, one successful payment — enforced here rather than trusted.
   *
   * The replay guard above only covers the SAME row arriving twice. This is
   * the other shape: two DIFFERENT payment rows against one share, which is
   * what every abandoned-and-retried checkout risks. The gateway session that
   * was retired can still be sitting completable in a tab somewhere, and if
   * its callback lands after the replacement has already settled, the resident
   * has paid twice.
   *
   * The money moved, so the row is recorded SUCCEEDED — calling it FAILED
   * would be a lie about a real transaction, and the trail is the only way
   * anybody finds the overpayment later. What it must not do is pretend to be
   * the payment that settled the bill: it is flagged, and the ledger trigger
   * has already done its work from the first one.
   */
  if (outcome === "SUCCEEDED" && payment.expenseShareId) {
    const alreadySettled = await prisma.payment.findFirst({
      where: {
        expenseShareId: payment.expenseShareId,
        status: "SUCCEEDED",
        id: { not: payment.id },
      },
      select: { id: true },
    });

    if (alreadySettled) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "SUCCEEDED",
          providerPayload: JSON.stringify({
            duplicateOf: alreadySettled.id,
            needsRefund: true,
            event: rawBody.slice(0, 3000),
          }),
          ...(providerPaymentId ? { providerPaymentId } : {}),
        },
      });

      console.error(
        `[m3.2] duplicate settlement on share ${payment.expenseShareId}: ` +
          `payment ${payment.id} landed after ${alreadySettled.id}. Refund required.`
      );

      return NextResponse.json({ received: true, duplicate: true, needsRefund: true });
    }
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: outcome,
      providerPayload: rawBody.slice(0, 4000),
      ...(providerPaymentId ? { providerPaymentId } : {}),
    },
  });

  return NextResponse.json({ received: true, status: outcome });
}
