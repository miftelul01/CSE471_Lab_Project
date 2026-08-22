import "server-only";

import { isHouseAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { asTaka } from "@/lib/wallet";

/**
 * M3.2 — server-side reads for the payments page — Miftelul Mehebub.
 *
 * Split out of lib/payments.ts for the same reason lib/neighborhood.server.ts
 * exists: that file is imported by a client component for its types, and a
 * module that touches prisma has no business being reachable from the browser
 * bundle even by accident.
 */

export type CashClaimView = {
  id: string;
  amount: number;
  claimedAt: string;
  payerName: string;
  expenseTitle: string;
};

/**
 * Cash handovers this user is entitled to rule on.
 *
 * Whoever fronted the money (Expense.paidById) decides, because they are the
 * only person who knows whether it arrived. When an expense has no payer —
 * allowed by the schema for costs nobody put money down for — the house admin
 * stands in, since somebody has to be able to close the loop.
 *
 * The claimant is excluded even when they would otherwise qualify: a resident
 * who paid a bill and also owes a share of it must not be able to confirm
 * their own handover, or "cash" becomes a button that clears your own debts.
 */
export async function cashClaimsFor(userId: string): Promise<CashClaimView[]> {
  const pending = await prisma.payment.findMany({
    where: { provider: "CASH", status: "PENDING", userId: { not: userId } },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: {
      id: true,
      amount: true,
      createdAt: true,
      userId: true,
      user: { select: { name: true } },
      expenseShare: {
        select: { expense: { select: { title: true, houseId: true, paidById: true } } },
      },
    },
  });

  const claims: CashClaimView[] = [];

  for (const payment of pending) {
    const expense = payment.expenseShare?.expense;
    if (!expense) continue;

    // Mirrors canConfirm() in app/api/payments/cash/route.ts, including the
    // case where the bill's payer is the claimant themselves — they cannot
    // confirm their own handover, so the admin has to be able to.
    const claimantIsPayer = expense.paidById === payment.userId;
    const allowed =
      expense.paidById && !claimantIsPayer
        ? expense.paidById === userId
        : await isHouseAdmin(userId, expense.houseId);
    if (!allowed) continue;

    claims.push({
      id: payment.id,
      amount: asTaka(payment.amount),
      claimedAt: payment.createdAt.toISOString(),
      payerName: payment.user.name,
      expenseTitle: expense.title,
    });
  }

  return claims;
}
