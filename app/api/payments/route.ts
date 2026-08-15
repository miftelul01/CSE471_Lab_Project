import { notImplemented, ok, withUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/** M3.2 Payment Integration (bKash / Stripe) — Miftelul Mehebub. */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const payments = await prisma.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return ok({ payments });
});

/**
 * TODO (M3.2) — start a payment:
 *  1. Look up the ExpenseShare and take the amount FROM THE DATABASE, never
 *     from the request body. A client-supplied amount means anyone can settle
 *     a 20,000 BDT bill by posting {"amount": 1}.
 *  2. Create a Payment with status INITIATED.
 *  3. Create the gateway session, store providerPaymentId, return the redirect.
 *
 * The old schema had no RLS update policy for users on payments, so nobody
 * could mark their own payment SUCCEEDED from the browser. That guarantee is
 * gone — only the verified webhook route may advance status. Never expose a
 * PATCH here that accepts a status from the client.
 */
export const POST = withUser(async () => notImplemented("Starting a payment"));
