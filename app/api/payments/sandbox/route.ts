import { badRequest, missingFields, ok, readJson, withUser } from "@/lib/api";
import { hasRealGateway, signSandboxPayload } from "@/lib/payments";
import { prisma } from "@/lib/prisma";

/**
 * M3.2 — the sandbox gateway's "confirm" button — Miftelul Mehebub.
 *
 * Stands in for the card form a real provider would host. It is NOT a shortcut
 * around the payment rules: it signs a callback server-side and posts it to the
 * real webhook, which verifies the signature and applies the ledger trigger
 * exactly as it would for Stripe. The only thing simulated is the bank.
 *
 * The signing secret never leaves the server, so the browser cannot forge a
 * callback of its own — the sandbox page can only ask this route to sign for a
 * payment the signed-in user actually owns.
 */

export const dynamic = "force-dynamic";

type ConfirmBody = { paymentId?: string; outcome?: "SUCCEEDED" | "FAILED" };

export const POST = withUser(async (user, req: Request) => {
  // With a real gateway configured there is no reason for this route to exist,
  // and leaving it live would be a second way to settle a bill.
  if (hasRealGateway()) {
    return badRequest("A live payment gateway is configured; the sandbox is disabled.");
  }

  const body = await readJson<ConfirmBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["paymentId"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  const paymentId = String(body.paymentId);
  const outcome = body.outcome === "FAILED" ? "FAILED" : "SUCCEEDED";

  // Ownership is checked here rather than in the webhook, because the webhook
  // has no session to check against. Without this, any signed-in user could
  // walk payment ids and settle other people's bills through the sandbox.
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, userId: true, status: true },
  });
  if (!payment || payment.userId !== user.id) {
    return badRequest("No such payment.");
  }
  if (payment.status === "SUCCEEDED") return badRequest("That payment already went through.");

  const rawBody = JSON.stringify({ paymentId, outcome });
  const origin = new URL(req.url).origin;

  const response = await fetch(`${origin}/api/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sandbox-signature": signSandboxPayload(rawBody),
    },
    body: rawBody,
  });

  if (!response.ok) {
    return badRequest("The sandbox callback was rejected.");
  }

  return ok({ paymentId, outcome });
});
