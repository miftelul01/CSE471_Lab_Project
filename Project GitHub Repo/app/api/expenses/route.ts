import { badRequest, notImplemented, ok, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** M2.1 Shared Wallet & Bill-Splitting Engine — Miftelul Mehebub. */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before using the shared wallet.");

  const expenses = await prisma.expense.findMany({
    where: { houseId },
    include: {
      shares: { include: { user: { select: { id: true, name: true } } } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { spentOn: "desc" },
  });

  // The house_balances SQL view is gone with Supabase; the same figures come
  // from a grouped aggregate, which Prisma can express directly.
  const grouped = await prisma.expenseShare.groupBy({
    by: ["userId", "status"],
    where: { expense: { houseId } },
    _sum: { amount: true },
  });

  return ok({ expenses, balances: grouped });
});

/**
 * TODO (M2.1) — the heart of the feature:
 *  1. assertHouseMember(user, houseId) from lib/authz.ts.
 *  2. Inside prisma.$transaction: create the expense, then one ExpenseShare
 *     per ACTIVE house member.
 *       EQUAL  -> amount / memberCount in paisa, distributing the remainder so
 *                 the shares sum EXACTLY to the total. Naive rounding loses
 *                 money and the ledger never balances.
 *       CUSTOM -> take amounts from the body; reject unless they sum to total.
 *     A transaction means a failure half-way can't leave an expense with no
 *     shares (this is what the manual rollback used to do).
 */
export const POST = withUser(async () => notImplemented("Adding shared expenses"));

/** TODO (M2.1): mark a share PAID/WAIVED. A DB trigger stamps settledAt. */
export const PATCH = withUser(async () => notImplemented("Settling a share"));
