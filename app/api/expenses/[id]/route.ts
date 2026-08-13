import { notFound, ok, withUser } from "@/lib/api";
import { assertCanDeleteExpense, assertHouseMember } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { EXPENSE_INCLUDE, toWalletExpense } from "@/lib/wallet";

type Params = { params: { id: string } };

/** M2.1 Shared Wallet & Bill-Splitting Engine — Miftelul Mehebub. */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, _req: Request, { params }: Params) => {
  const expense = await prisma.expense.findUnique({
    where: { id: params.id },
    include: EXPENSE_INCLUDE,
  });
  if (!expense) return notFound("No such expense");

  // Scoped to the house, not merely "signed in" — otherwise anyone holding an
  // id could read what another household spends and who still owes for it.
  await assertHouseMember(user, expense.houseId);

  return ok({ expense: toWalletExpense(expense) });
});

/**
 * Remove an expense that shouldn't be on the wallet — a duplicate, or an
 * amount typed with an extra zero that has just charged the whole house.
 *
 * A hard delete is right here, unlike a listing (which is only delisted,
 * because favourites and applications point at it). The shares cascade away
 * with it, and assertCanDeleteExpense has already established that none of
 * them were settled — so nothing anybody actually paid is being erased.
 */
export const DELETE = withUser(async (user, _req: Request, { params }: Params) => {
  await assertCanDeleteExpense(user, params.id);

  await prisma.expense.delete({ where: { id: params.id } });
  return ok({ id: params.id, deleted: true });
});
