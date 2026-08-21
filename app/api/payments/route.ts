import { HttpError, badRequest, missingFields, ok, readJson, withUser } from "@/lib/api";
import { loadPayableShare } from "@/lib/authz";
import { createCheckout } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { asTaka, takaToPaisa } from "@/lib/wallet";

/**
 * M3.2 Payment Integration (bKash / Stripe) — Miftelul Mehebub.
 *
 * "Integrated directly with the Shared Wallet, allowing residents to pay their
 * calculated share of the bills securely through the app. Upon successful
 * payment, the user's ledger status automatically updates to paid."
 *
 * That last sentence is enforced in the database, not here: the
 * payments_apply_to_ledger trigger flips the ExpenseShare to PAID when a
 * payment reaches SUCCEEDED. Nothing in this file writes expense_shares, and
 * nothing here may advance a payment's status either — only the verified
 * webhook does that. There is deliberately no PATCH on this route.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const payments = await prisma.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      expenseShare: { select: { id: true, expense: { select: { title: true } } } },
    },
  });

  return ok({
    payments: payments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      status: payment.status,
      amount: asTaka(payment.amount),
      currency: payment.currency,
      expenseTitle: payment.expenseShare?.expense.title ?? null,
      createdAt: payment.createdAt.toISOString(),
    })),
  });
});

type StartBody = { expenseShareId?: string };

/**
 * Start a payment for one of the caller's own pending shares.
 *
 * The body carries a share id and nothing else — no amount, no user id. Both
 * are read from the row (see loadPayableShare), because a client-supplied
 * amount means anyone can settle a 20,000 BDT bill by posting {"amount": 1}.
 */
export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<StartBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["expenseShareId"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  const share = await loadPayableShare(user, String(body.expenseShareId));

  if (share.status === "PAID") return badRequest("That share is already paid.");
  if (share.status === "WAIVED") {
    return badRequest("That share was waived, so there is nothing to pay.");
  }

  // A share already carrying a SUCCEEDED payment must never open a second
  // checkout: the trigger has flipped it to PAID and a second charge would be
  // real money with no ledger row to answer for it.
  if (share.payments.some((payment) => payment.status === "SUCCEEDED")) {
    return badRequest("A payment for that share has already gone through.");
  }

  const amountPaisa = takaToPaisa(asTaka(share.amount));
  if (amountPaisa <= 0) return badRequest("That share has nothing left to pay.");

  // The row is created BEFORE the gateway call and always as INITIATED. Two
  // reasons: the trigger that settles the ledger fires on UPDATE, so a row
  // inserted as SUCCEEDED would never move the share; and if the gateway call
  // throws, we still hold a record that an attempt was made.
  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      houseId: share.expense.houseId,
      expenseShareId: share.id,
      provider: "MANUAL",
      status: "INITIATED",
      amount: share.amount,
      currency: "BDT",
    },
    select: { id: true },
  });

  const origin = new URL(req.url).origin;

  let session;
  try {
    session = await createCheckout({
      paymentId: payment.id,
      amountPaisa,
      currency: "BDT",
      description: `${share.expense.title} — your share`,
      origin,
    });
  } catch (error) {
    // The attempt is marked FAILED rather than deleted, so a resident who says
    // "I tried to pay and it broke" has something to point at.
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", providerPayload: { error: String(error) } },
    });
    throw new HttpError("Could not reach the payment gateway. Nothing was charged.", 503);
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { provider: session.provider, providerPaymentId: session.providerPaymentId },
  });

  return ok({ paymentId: payment.id, redirectUrl: session.redirectUrl }, 201);
});
