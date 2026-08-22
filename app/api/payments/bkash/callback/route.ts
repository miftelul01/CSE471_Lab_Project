import { NextResponse } from "next/server";

import {
  bkashSucceeded,
  executeBkashPayment,
  hasBkash,
  queryBkashPayment,
  signInternalEvent,
} from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { asTaka } from "@/lib/wallet";

/**
 * M3.2 — where bKash sends the resident back — Miftelul Mehebub.
 *
 * bKash has no webhook. It redirects the resident's BROWSER here with
 * `?paymentID=...&status=success|failure|cancel`, and every byte of that is
 * attacker-controlled — it is a URL, and anyone who can read one can type one.
 * So `status` decides one thing only: whether it is worth calling execute at
 * all. What actually settles the bill is the execute call this server makes
 * with its own credentials, and the amount bKash reports back.
 *
 * Not wrapped in withUser(). The resident arrives on a cross-site redirect and
 * their session may or may not survive it depending on the browser, but the
 * decision does not rest on who is holding the URL — it rests on what bKash
 * says when we ask it directly. A stranger replaying this link achieves
 * nothing they could not achieve by leaving it alone.
 */

export const dynamic = "force-dynamic";

/** Sends the resident back to the page they started from, with something the
 * UI can turn into a sentence. */
function back(origin: string, params: Record<string, string>) {
  const url = new URL("/payments", origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url, { status: 303 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  if (!hasBkash()) return back(origin, { error: "bkash-not-configured" });

  const paymentID = url.searchParams.get("paymentID");
  const reported = url.searchParams.get("status");
  if (!paymentID) return back(origin, { error: "bkash-no-payment" });

  const payment = await prisma.payment.findFirst({
    where: { provider: "BKASH", providerPaymentId: paymentID },
    select: { id: true, status: true, amount: true },
  });

  // An id we have no row for is not ours to reason about. Say nothing useful.
  if (!payment) return back(origin, { error: "bkash-unknown" });

  // Already settled — a reload of this URL, or a second tab. Idempotent by
  // design: the webhook would refuse the replay anyway, but there is no reason
  // to spend a bKash call finding that out.
  if (payment.status === "SUCCEEDED") return back(origin, { paid: "1" });

  /**
   * The resident cancelled, or bKash failed them — reportedly.
   *
   * This used to take that at face value and mark the row FAILED, which is a
   * double-charge vector rather than merely sloppy. `status` is a query
   * parameter: anyone holding the paymentID can arrive here with
   * `&status=cancel`. Failing the row frees the share, the resident (whose
   * real bKash tab is still open and still completable) starts a second
   * payment, and then completes both. Two transactions, one bill.
   *
   * So a claimed cancellation is verified like everything else. Only bKash
   * saying the session is no longer live retires the row; while it still says
   * "Initiated", the attempt stands and the resident is simply sent back.
   */
  if (reported && reported !== "success") {
    const state = await queryBkashPayment(paymentID).catch(() => null);

    if (state && bkashSucceeded(state)) {
      // Cancelled in the URL, completed in reality. Believe bKash.
      await settle(origin, payment.id, "SUCCEEDED", {
        trxID: state.trxID ?? null,
        transactionStatus: state.transactionStatus ?? null,
        note: "reported-cancel-but-completed",
      });
      return back(origin, { paid: "1" });
    }

    if (state?.transactionStatus === "Initiated") {
      return back(origin, { cancelled: "1" });
    }

    await settle(origin, payment.id, "FAILED", {
      reportedStatus: reported,
      confirmedStatus: state?.transactionStatus ?? null,
    });
    return back(origin, { cancelled: "1" });
  }

  /**
   * Execute is not safely repeatable, which is the whole reason for the query
   * fallback. If the resident double-taps, or our first execute succeeded
   * upstream but the response never reached us, the second attempt is refused
   * even though the money moved. Asking for the payment's status is then the
   * only way to tell "never paid" from "already paid" — and getting that wrong
   * in the pessimistic direction means a resident who has been debited is
   * still shown an unpaid bill.
   */
  let result = await executeBkashPayment(paymentID).catch(() => null);
  if (!result || !bkashSucceeded(result)) {
    const queried = await queryBkashPayment(paymentID).catch(() => null);
    if (queried && bkashSucceeded(queried)) result = queried;
  }

  if (!result || !bkashSucceeded(result)) {
    await settle(origin, payment.id, "FAILED", {
      statusCode: result?.statusCode ?? null,
      statusMessage: result?.statusMessage ?? null,
      transactionStatus: result?.transactionStatus ?? null,
    });
    return back(origin, { failed: "1" });
  }

  /**
   * What bKash says was paid must be what we asked for.
   *
   * The amount was fixed server-side at create time, so a mismatch means the
   * transaction being executed is not the one this row represents — a stale
   * paymentID, a reused row, or something worse. Marking it paid on the
   * strength of a "Completed" alone would settle a 20,000 BDT share against a
   * 1 BDT transaction.
   */
  const expected = asTaka(payment.amount);
  const actual = Number(result.amount);
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > 0.009) {
    await settle(origin, payment.id, "FAILED", {
      reason: "amount-mismatch",
      expected,
      reported: result.amount ?? null,
    });
    return back(origin, { failed: "1" });
  }

  await settle(origin, payment.id, "SUCCEEDED", {
    trxID: result.trxID ?? null,
    transactionStatus: result.transactionStatus ?? null,
    customerMsisdn: result.customerMsisdn ?? null,
    amount: result.amount ?? null,
  });

  return back(origin, { paid: "1" });
}

/**
 * Hands the outcome to the webhook rather than writing it here.
 *
 * The webhook is the only place a payment may reach SUCCEEDED, and that stays
 * true for bKash: this route proves what happened, signs it, and posts it
 * through the same door Stripe uses. Idempotency, the ledger trigger and the
 * replay guard all live on the other side of it, and duplicating them here
 * would mean two places to get them right.
 *
 * `providerPaymentId` is deliberately NOT sent: it already holds bKash's
 * paymentID, which is how this row was found and what the unique index is
 * built on. The trxID goes into the payload instead.
 */
async function settle(
  origin: string,
  paymentId: string,
  outcome: "SUCCEEDED" | "FAILED",
  detail: Record<string, unknown>
) {
  const rawBody = JSON.stringify({ paymentId, outcome, provider: "BKASH", ...detail });

  const response = await fetch(`${origin}/api/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-signature": signInternalEvent(rawBody),
    },
    body: rawBody,
  });

  if (!response.ok) {
    console.error("[m3.2 bkash] webhook rejected the callback", await response.text());
  }
}
