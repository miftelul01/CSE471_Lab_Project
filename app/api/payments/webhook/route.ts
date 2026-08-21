import { NextResponse } from "next/server";

import { hasRealGateway, verifySandboxSignature, verifyStripeSignature } from "@/lib/payments";
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

type SandboxEvent = { paymentId?: string; outcome?: "SUCCEEDED" | "FAILED" };

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(req: Request) {
  // The RAW bytes, not req.json(). Signature verification hashes exactly what
  // was sent, and re-serialising a parsed object changes key order and spacing.
  const rawBody = await req.text();

  const stripeSignature = req.headers.get("stripe-signature");
  const sandboxSignature = req.headers.get("x-sandbox-signature");

  let paymentId: string | null = null;
  let providerPaymentId: string | null = null;
  let outcome: "SUCCEEDED" | "FAILED" = "SUCCEEDED";

  if (hasRealGateway() || stripeSignature) {
    if (!stripeSignature || !verifyStripeSignature(rawBody, stripeSignature)) {
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
    if (!sandboxSignature || !verifySandboxSignature(rawBody, sandboxSignature)) {
      return bad("Invalid signature.");
    }

    let event: SandboxEvent;
    try {
      event = JSON.parse(rawBody) as SandboxEvent;
    } catch {
      return bad("Malformed event body.");
    }

    paymentId = event.paymentId ?? null;
    outcome = event.outcome === "FAILED" ? "FAILED" : "SUCCEEDED";
  }

  if (!paymentId && !providerPaymentId) return bad("Event identified no payment.");

  const payment = await prisma.payment.findFirst({
    where: paymentId ? { id: paymentId } : { providerPaymentId: providerPaymentId! },
    select: { id: true, status: true },
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
