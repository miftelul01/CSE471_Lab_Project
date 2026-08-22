import { badRequest, forbidden, missingFields, notFound, ok, readJson, withUser } from "@/lib/api";
import { isHouseAdmin } from "@/lib/authz";
import { signInternalEvent } from "@/lib/payments";
import { cashClaimsFor } from "@/lib/payments.server";
import { prisma } from "@/lib/prisma";

/**
 * M3.2 — confirming (or rejecting) a cash handover — Miftelul Mehebub.
 *
 * ── WHY CASH NEEDS A SECOND PERSON ──────────────────────────────────────────
 * Every other method here settles because something outside this app said so:
 * Stripe signs a webhook, bKash answers an execute call. Cash has no such
 * witness — the only evidence is that a resident says they handed over money.
 *
 * If saying it were enough, the Pay button would be a "mark my own debt paid"
 * button, and the ledger would stop meaning anything the moment one person
 * decided to use it that way. So a cash payment is filed PENDING and settles
 * only when the person who actually put the money down agrees it arrived.
 *
 * That person is Expense.paidById. When an expense has no payer — the schema
 * allows it, for costs the system generated rather than anyone fronting — the
 * house admin stands in, because somebody has to be able to close the loop and
 * it must not be the person who owes.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const dynamic = "force-dynamic";

/** Cash claims this user is entitled to rule on, for the payments page. */
export const GET = withUser(async (user) => ok({ claims: await cashClaimsFor(user.id) }));

type ConfirmBody = { paymentId?: string; outcome?: "SUCCEEDED" | "FAILED" };

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<ConfirmBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["paymentId"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  const paymentId = String(body.paymentId);
  const outcome = body.outcome === "FAILED" ? "FAILED" : "SUCCEEDED";

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      userId: true,
      provider: true,
      status: true,
      expenseShare: { select: { expense: { select: { houseId: true, paidById: true } } } },
    },
  });

  if (!payment) return notFound("No such payment.");
  if (payment.provider !== "CASH") return badRequest("That payment isn't a cash handover.");
  if (payment.status === "SUCCEEDED") return badRequest("That payment already went through.");
  if (payment.status !== "PENDING") return badRequest("That cash claim is no longer open.");

  const expense = payment.expenseShare?.expense;
  if (!expense) return badRequest("That payment is no longer attached to a bill.");

  // The one rule that matters: the person who owes cannot be the person who
  // confirms, even if they are the house admin. Checked before the role, so
  // being an admin never becomes a way to clear your own debts.
  if (payment.userId === user.id) {
    return forbidden("Someone else has to confirm a cash payment — you can't confirm your own.");
  }

  if (!(await canConfirm(user.id, expense.paidById, expense.houseId))) {
    return forbidden("Only whoever paid the bill, or the house admin, can confirm a cash payment.");
  }

  // Settled through the webhook like everything else, so there is exactly one
  // path to SUCCEEDED and one place the ledger trigger is relied on.
  const rawBody = JSON.stringify({
    paymentId,
    outcome,
    provider: "CASH",
    confirmedBy: user.id,
    confirmedAt: new Date().toISOString(),
  });

  const origin = new URL(req.url).origin;
  const response = await fetch(`${origin}/api/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-signature": signInternalEvent(rawBody),
    },
    body: rawBody,
  });

  if (!response.ok) return badRequest("The confirmation was rejected.");

  return ok({ paymentId, outcome });
});

/** Whoever fronted the money, or — when nobody did — the house admin. */
async function canConfirm(
  userId: string,
  paidById: string | null,
  houseId: string
): Promise<boolean> {
  if (paidById) return paidById === userId;
  return isHouseAdmin(userId, houseId);
}
