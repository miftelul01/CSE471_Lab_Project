import { HttpError, badRequest, missingFields, ok, readJson, withUser } from "@/lib/api";
import { loadPayableShare } from "@/lib/authz";
import { LIVE_PAYMENT_STATUSES, STALE_CHECKOUT_MS, createCheckout } from "@/lib/payments";
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

  const amountPaisa = takaToPaisa(asTaka(share.amount));
  if (amountPaisa <= 0) return badRequest("That share has nothing left to pay.");

  const origin = new URL(req.url).origin;

  /**
   * Deciding whether this share may open a checkout, and creating the row, both
   * happen under a lock on the share.
   *
   * Checking and then inserting without one is a genuine double charge: two
   * taps on Pay arrive together, both read "no successful payment yet", and
   * both open a checkout the resident can complete. There is no unique index
   * on expense_share_id to catch it afterwards, so SELECT ... FOR UPDATE is
   * what makes the second request wait for the first to commit and then see it.
   *
   * The gateway call is deliberately OUTSIDE this transaction. Holding a row
   * lock open across a network round trip to Stripe would let one slow response
   * stall every other request touching that share.
   */
  const decision = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM expense_shares WHERE id = ${share.id} FOR UPDATE`;

    const live = await tx.payment.findMany({
      where: { expenseShareId: share.id, status: { in: LIVE_PAYMENT_STATUSES } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, createdAt: true, providerPayload: true },
    });

    // The trigger has already flipped the share to PAID; a second charge would
    // be real money with no ledger row to answer for it.
    if (live.some((payment) => payment.status === "SUCCEEDED")) {
      return { kind: "paid" as const };
    }

    const cutoff = new Date(Date.now() - STALE_CHECKOUT_MS);

    const stale = live.filter((payment) => payment.createdAt < cutoff);
    if (stale.length > 0) {
      await tx.payment.updateMany({
        where: { id: { in: stale.map((payment) => payment.id) } },
        data: { status: "FAILED" },
      });
    }

    // A checkout still within the window is resumed rather than duplicated —
    // the resident gets back the same gateway session instead of a second one.
    const resumable = live.find((payment) => payment.createdAt >= cutoff);
    if (resumable) {
      const stored = (resumable.providerPayload as { redirectUrl?: string } | null)?.redirectUrl;
      return { kind: "resume" as const, paymentId: resumable.id, redirectUrl: stored ?? null };
    }

    // Always INITIATED, never SUCCEEDED: payments_apply_to_ledger fires on
    // UPDATE, so a row inserted in its final state would never settle the
    // share. Created before the gateway call so a failure still leaves a trace.
    const created = await tx.payment.create({
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
    return { kind: "created" as const, paymentId: created.id };
  });

  if (decision.kind === "paid") {
    return badRequest("A payment for that share has already gone through.");
  }

  if (decision.kind === "resume") {
    // Only reachable if a concurrent request created the row microseconds ago
    // and has not yet stored its gateway URL.
    if (!decision.redirectUrl) {
      return badRequest("A payment for this share is already starting. Try again in a moment.");
    }
    return ok({ paymentId: decision.paymentId, redirectUrl: decision.redirectUrl, resumed: true });
  }

  const paymentId = decision.paymentId;

  let session;
  try {
    session = await createCheckout({
      paymentId,
      amountPaisa,
      currency: "BDT",
      description: `${share.expense.title} — your share`,
      origin,
    });
  } catch (error) {
    // Marked FAILED rather than deleted, so a resident who says "I tried to pay
    // and it broke" has something to point at.
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "FAILED", providerPayload: { error: String(error) } },
    });
    throw new HttpError("Could not reach the payment gateway. Nothing was charged.", 503);
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      provider: session.provider,
      providerPaymentId: session.providerPaymentId,
      // Stored so a concurrent or resumed request returns the SAME checkout
      // rather than opening a second one against the same bill.
      providerPayload: { redirectUrl: session.redirectUrl },
    },
  });

  return ok({ paymentId, redirectUrl: session.redirectUrl }, 201);
});
