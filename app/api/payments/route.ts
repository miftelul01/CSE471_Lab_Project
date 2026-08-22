import { Prisma } from "@prisma/client";

import { HttpError, badRequest, missingFields, ok, readJson, withUser } from "@/lib/api";
import type { SessionUser } from "@/lib/auth";
import { loadPayableShare } from "@/lib/authz";
import {
  LIVE_PAYMENT_STATUSES,
  STALE_CHECKOUT_MS,
  type PaymentMethod,
  availableMethods,
  bkashSucceeded,
  createCheckout,
  isMethodAvailable,
  providerForMethod,
  providerLabel,
  queryBkashPayment,
} from "@/lib/payments";
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

type StartBody = { expenseShareId?: string; method?: string };

/**
 * Start a payment for one of the caller's own pending shares.
 *
 * The body carries a share id and a method, and nothing else — no amount, no
 * user id. Both are read from the row (see loadPayableShare), because a
 * client-supplied amount means anyone can settle a 20,000 BDT bill by posting
 * {"amount": 1}.
 *
 * The method is checked against what is actually configured rather than merely
 * being a known enum value. Otherwise a request naming BKASH on a deployment
 * with no bKash credentials gets an exception from deep inside the client
 * instead of an answer it can act on.
 */
export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<StartBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["expenseShareId", "method"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  const method = String(body.method);
  if (!isMethodAvailable(method)) {
    const offered = availableMethods().map((option) => option.method);
    return badRequest(`That payment method isn't available. Choose one of: ${offered.join(", ")}.`);
  }

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
      select: {
        id: true,
        status: true,
        createdAt: true,
        provider: true,
        providerPaymentId: true,
        providerPayload: true,
      },
    });

    // The trigger has already flipped the share to PAID; a second charge would
    // be real money with no ledger row to answer for it.
    if (live.some((payment) => payment.status === "SUCCEEDED")) {
      return { kind: "paid" as const };
    }

    // A cash claim waits on a person, not a gateway. It must not be swept up
    // by the staleness rule below — thirty minutes is a sensible life for an
    // abandoned checkout tab and a nonsense one for "I handed Nusrat the money
    // and she hasn't confirmed yet" — and it must not be resumed into a
    // redirect either, because there is nowhere to redirect to.
    const cash = live.find((payment) => payment.provider === "CASH");
    if (cash) return { kind: "awaitingCash" as const, paymentId: cash.id };

    const cutoff = new Date(Date.now() - STALE_CHECKOUT_MS);

    /**
     * bKash attempts are never swept on age alone.
     *
     * The sweep exists for abandoned checkout tabs, and for Stripe that is
     * safe: a stale session is dead and failing it costs nothing. A bKash
     * session at minute 31 may still be sitting open and completable, and
     * failing it frees the share for a second payment — so the resident
     * finishes both and pays the bill twice.
     *
     * Since the only way to know is to ask, and this runs inside a row lock
     * where a network call has no business, bKash rows stay resumable at any
     * age and the resume path below asks bKash before doing anything. A truly
     * expired one is retired there, one tap later, with an answer behind it.
     */
    const stale = live.filter(
      (payment) => payment.createdAt < cutoff && payment.provider !== "BKASH"
    );
    if (stale.length > 0) {
      await tx.payment.updateMany({
        where: { id: { in: stale.map((payment) => payment.id) } },
        data: { status: "FAILED" },
      });
    }

    // A checkout still within the window is resumed rather than duplicated —
    // the resident gets back the same gateway session instead of a second one.
    const resumable = live.find(
      (payment) => payment.createdAt >= cutoff || payment.provider === "BKASH"
    );
    if (resumable) {
      const stored = (resumable.providerPayload as { redirectUrl?: string } | null)?.redirectUrl;
      return {
        kind: "resume" as const,
        paymentId: resumable.id,
        provider: resumable.provider,
        providerPaymentId: resumable.providerPaymentId,
        redirectUrl: stored ?? null,
        handedOff:
          (resumable.providerPayload as { handedOff?: boolean } | null)?.handedOff === true,
      };
    }

    // Created before the gateway call, so a failure still leaves a trace.
    const created = await tx.payment.create({
      data: {
        userId: user.id,
        houseId: share.expense.houseId,
        expenseShareId: share.id,
        provider: providerForMethod(method),
        // PENDING for cash, which is a claim awaiting a human; INITIATED for a
        // gateway, which is a checkout awaiting a resident. Never SUCCEEDED:
        // payments_apply_to_ledger fires on UPDATE, so a row inserted in its
        // final state would never settle the share.
        status: method === "CASH" ? "PENDING" : "INITIATED",
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

  if (decision.kind === "awaitingCash") {
    return badRequest(
      "A cash payment for this share is already waiting to be confirmed by whoever paid the bill."
    );
  }

  if (decision.kind === "resume") {
    // Only reachable if a concurrent request created the row microseconds ago
    // and has not yet stored its gateway URL.
    if (!decision.redirectUrl) {
      return badRequest("A payment for this share is already starting. Try again in a moment.");
    }

    /**
     * An attempt already running under a DIFFERENT method is not resumable.
     *
     * Handing back a bKash URL to someone who just picked Cash is nonsense,
     * and quietly failing the old attempt so the new one can start is worse:
     * the first checkout may still be open in another tab, and completing both
     * is a real double payment. Saying so is the only honest answer.
     */
    if (decision.provider !== providerForMethod(method)) {
      return badRequest(
        `You already have a ${providerLabel(decision.provider)} payment in progress for this bill. ` +
          `Finish or cancel it before paying another way.`
      );
    }

    /**
     * A bKash checkout URL is single-use, and bKash will not tell you so.
     *
     * Its payment-status endpoint answers "Initiated" both for a session that
     * was never opened and for one the resident opened and walked away from —
     * but loading that URL a second time renders "Invalid page access
     * request", a dead end with no way forward. Asking bKash therefore cannot
     * distinguish the two cases, so the only reliable signal is our own: we
     * know whether we have already sent a browser to it.
     *
     * So a bKash URL is handed out exactly once. A second tap on Pay retires
     * that attempt and opens a fresh checkout, which is what the resident is
     * plainly asking for. The double-payment worry this used to guard against
     * — the retired session still sitting completable in another tab — is
     * handled where it belongs, in the webhook: a share that already has a
     * successful payment cannot be settled a second time by a different one.
     *
     * Completed is still checked first. A session that succeeded while the
     * resident was away must settle, not be replaced.
     */
    if (decision.provider === "BKASH") {
      if (decision.providerPaymentId) {
        const state = await queryBkashPayment(decision.providerPaymentId).catch(() => null);
        if (state && bkashSucceeded(state)) {
          return badRequest("That payment already went through. Refresh to see it settled.");
        }
      }

      // A bKash session counts as spent once it exists, not merely once the
      // flag was written: returning the URL from this route IS the hand-off,
      // and rows created before that flag existed still had theirs handed out.
      if (decision.handedOff || decision.providerPaymentId) {
        await prisma.payment.update({
          where: { id: decision.paymentId },
          data: { status: "FAILED", providerPayload: { reason: "bkash-session-already-opened" } },
        });
        // Fall through to open a brand new checkout below, rather than making
        // the resident tap Pay a third time to get somewhere that works.
        return openFreshCheckout({
          user,
          houseId: share.expense.houseId,
          shareId: share.id,
          amount: share.amount,
          amountPaisa,
          description: `${share.expense.title} — your share`,
          origin,
          method: method as PaymentMethod,
        });
      }
    }

    // First hand-off of a URL we created but never sent anyone to.
    await prisma.payment.update({
      where: { id: decision.paymentId },
      data: {
        providerPayload: { redirectUrl: decision.redirectUrl, handedOff: true },
      },
    });

    return ok({ paymentId: decision.paymentId, redirectUrl: decision.redirectUrl, resumed: true });
  }

  const paymentId = decision.paymentId;

  // Cash stops here. There is no gateway to call and nothing to redirect to —
  // the row sits PENDING until the person who actually paid the bill confirms
  // it, which is the only thing that can move it to SUCCEEDED.
  if (method === "CASH") {
    return ok({ paymentId, awaitingConfirmation: true }, 201);
  }

  return openCheckoutFor({
    paymentId,
    user,
    amountPaisa,
    description: `${share.expense.title} — your share`,
    origin,
    method: method as PaymentMethod,
  });
});

/**
 * Opens a gateway session against an EXISTING payment row and stores where it
 * sent the resident.
 *
 * `handedOff` is recorded with the URL because a bKash checkout can only be
 * opened once — see the resume path above, which reads it to decide whether a
 * URL is still worth offering or has been spent.
 */
async function openCheckoutFor(args: {
  paymentId: string;
  user: SessionUser;
  amountPaisa: number;
  description: string;
  origin: string;
  method: PaymentMethod;
}) {
  let session;
  try {
    session = await createCheckout({
      paymentId: args.paymentId,
      amountPaisa: args.amountPaisa,
      currency: "BDT",
      description: args.description,
      origin: args.origin,
      method: args.method,
      // bKash wants something identifying the payer. Their own number is the
      // useful answer when we have it; the user id is a stable stand-in when
      // we do not, and neither is trusted for anything.
      payerReference: args.user.profile.phone ?? args.user.id,
    });
  } catch (error) {
    // Marked FAILED rather than deleted, so a resident who says "I tried to pay
    // and it broke" has something to point at.
    await prisma.payment.update({
      where: { id: args.paymentId },
      data: { status: "FAILED", providerPayload: { error: String(error) } },
    });
    throw new HttpError("Could not reach the payment gateway. Nothing was charged.", 503);
  }

  await prisma.payment.update({
    where: { id: args.paymentId },
    data: {
      provider: session.provider,
      providerPaymentId: session.providerPaymentId,
      providerPayload: { redirectUrl: session.redirectUrl, handedOff: true },
    },
  });

  return ok({ paymentId: args.paymentId, redirectUrl: session.redirectUrl }, 201);
}

/**
 * Creates a NEW payment row and opens a checkout on it.
 *
 * Used when a bKash session has been spent: the old row is retired and the
 * resident gets a working checkout from the same tap, rather than an error
 * telling them to try what they just tried.
 */
async function openFreshCheckout(args: {
  user: SessionUser;
  houseId: string;
  shareId: string;
  amount: Prisma.Decimal;
  amountPaisa: number;
  description: string;
  origin: string;
  method: PaymentMethod;
}) {
  const created = await prisma.payment.create({
    data: {
      userId: args.user.id,
      houseId: args.houseId,
      expenseShareId: args.shareId,
      provider: providerForMethod(args.method),
      status: "INITIATED",
      amount: args.amount,
      currency: "BDT",
    },
    select: { id: true },
  });

  return openCheckoutFor({
    paymentId: created.id,
    user: args.user,
    amountPaisa: args.amountPaisa,
    description: args.description,
    origin: args.origin,
    method: args.method,
  });
}
