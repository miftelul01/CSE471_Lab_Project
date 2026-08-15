import { badRequest, missingFields, ok, readJson, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { assertCanSettleShare, assertHouseMember } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PAGE_SIZE,
  EXPENSE_CATEGORIES,
  EXPENSE_INCLUDE,
  asTaka,
  MAX_DESCRIPTION_LENGTH,
  MAX_PAGE_SIZE,
  MAX_TITLE_LENGTH,
  SHARE_STATUS_LABELS,
  SPLIT_METHODS,
  buildSplit,
  dhakaToday,
  paisaToDecimalString,
  settlementPlan,
  summarizeLedger,
  toPaisa,
  toWalletExpense,
} from "@/lib/wallet";
import type { ExpenseCategory, ShareStatus, SplitMethod } from "@prisma/client";

/** M2.1 Shared Wallet & Bill-Splitting Engine — Miftelul Mehebub. */

export const dynamic = "force-dynamic";

/** Reads a positive integer query param, falling back when absent or junk. */
function intParam(url: URL, name: string, fallback: number, max: number): number {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return fallback;
  return Math.min(value, max);
}

export const GET = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before using the shared wallet.");

  const url = new URL(req.url);
  const take = intParam(url, "limit", DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = intParam(url, "offset", 0, Number.MAX_SAFE_INTEGER);

  const category = url.searchParams.get("category");
  if (category && !EXPENSE_CATEGORIES.includes(category as ExpenseCategory)) {
    return badRequest(`category must be one of: ${EXPENSE_CATEGORIES.join(", ")}.`);
  }
  const where = { houseId, ...(category ? { category: category as ExpenseCategory } : {}) };

  const [rows, total, members, ledgerRows] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: EXPENSE_INCLUDE,
      orderBy: [{ spentOn: "desc" }, { createdAt: "desc" }],
      take,
      skip,
    }),
    prisma.expense.count({ where }),
    prisma.houseMember.findMany({
      where: { houseId, status: "ACTIVE" },
      select: { userId: true, user: { select: { name: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    // Balances must cover the WHOLE house, not just the page being shown —
    // paginating the ledger totals would report a different debt per page.
    prisma.expense.findMany({
      where: { houseId },
      include: EXPENSE_INCLUDE,
      orderBy: { spentOn: "desc" },
    }),
  ]);

  // The house_balances SQL view went with Supabase. Summing the shares gives
  // the same figures without needing it back.
  const wholeHouse = ledgerRows.map(toWalletExpense);
  const ledger = summarizeLedger(
    members.map((m) => ({ userId: m.userId, name: m.user.name })),
    wholeHouse
  );

  const nameOf = new Map(ledger.rows.map((row) => [row.userId, row.name]));

  return ok({
    expenses: rows.map(toWalletExpense),
    balances: ledger.rows,
    totals: ledger.totals,
    settlements: settlementPlan(wholeHouse, (id) => nameOf.get(id) ?? "Unknown"),
    page: { total, limit: take, offset: skip, returned: rows.length },
  });
});

type CreateExpenseBody = {
  title?: string;
  description?: string | null;
  amount?: number | string;
  category?: ExpenseCategory;
  splitMethod?: SplitMethod;
  spentOn?: string;
  /** Who actually paid. Defaults to whoever is adding the expense. */
  paidById?: string;
  /** CUSTOM: taka per housemate. SHARES: a weight per housemate. Keyed by user id. */
  allocations?: Record<string, unknown>;
};

/**
 * Add a shared expense and divide it across the house.
 *
 * Any resident may do this — the brief has the whole house adding groceries
 * and utilities, not just whoever runs the flat.
 *
 * The split is computed server-side from the amount and the current member
 * list; per-person amounts sent by the client are only ever read as *input* to
 * that calculation (CUSTOM/SHARES), never trusted as the answer. See
 * lib/wallet.ts for why it is all done in whole paisa.
 */
export const POST = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before using the shared wallet.");
  await assertHouseMember(user, houseId);

  const body = await readJson<CreateExpenseBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["title", "amount"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  const title = String(body.title).trim();
  if (!title) return badRequest("Give the expense a title.");
  if (title.length > MAX_TITLE_LENGTH) {
    return badRequest(`Title must be ${MAX_TITLE_LENGTH} characters or fewer.`);
  }

  const description = body.description?.toString().trim() || null;
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    return badRequest(`Notes must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
  }

  const totalPaisa = toPaisa(body.amount);
  if (totalPaisa === null) {
    return badRequest("Amount must be a positive number with at most 2 decimal places.");
  }

  const category = body.category ?? "OTHER";
  if (!EXPENSE_CATEGORIES.includes(category)) {
    return badRequest(`category must be one of: ${EXPENSE_CATEGORIES.join(", ")}.`);
  }

  const splitMethod = body.splitMethod ?? "EQUAL";
  if (!SPLIT_METHODS.includes(splitMethod)) {
    return badRequest(`splitMethod must be one of: ${SPLIT_METHODS.join(", ")}.`);
  }

  // spentOn is a DATE column, so it is pinned to UTC midnight. Letting the
  // server's local timezone decide would slide a late-evening Dhaka expense
  // onto the previous day.
  let spentOn = new Date();
  if (body.spentOn) {
    const parsed = new Date(body.spentOn);
    if (Number.isNaN(parsed.getTime())) return badRequest("spentOn is not a valid date.");
    spentOn = parsed;
  }
  spentOn = new Date(
    Date.UTC(spentOn.getUTCFullYear(), spentOn.getUTCMonth(), spentOn.getUTCDate())
  );
  // You cannot have spent money that hasn't been spent yet, and a fat-fingered
  // year would otherwise sit at the top of the history forever.
  if (spentOn.getTime() > dhakaToday().getTime()) {
    return badRequest("An expense can't be dated in the future.");
  }

  const members = await prisma.houseMember.findMany({
    where: { houseId, status: "ACTIVE" },
    select: { userId: true },
    orderBy: { joinedAt: "asc" },
  });
  const memberIds = members.map((m) => m.userId);

  // Naming a payer who isn't in the house would put the ledger permanently out
  // of balance — the house would owe a debt to somebody who can never be
  // reimbursed through it.
  const paidById = body.paidById ? String(body.paidById) : user.id;
  if (!memberIds.includes(paidById)) {
    return badRequest("Whoever paid must be an active member of the house.");
  }

  const split = buildSplit({
    method: splitMethod,
    totalPaisa,
    memberIds,
    allocations: body.allocations,
  });
  if ("error" in split) return badRequest(split.error);

  // Prisma runs a nested create as a single transaction, so there is no window
  // in which the expense exists without the shares that make it mean anything.
  const now = new Date();

  const expense = await prisma.expense.create({
    data: {
      houseId,
      createdById: user.id,
      paidById,
      title,
      description,
      amount: paisaToDecimalString(totalPaisa),
      category,
      splitMethod,
      spentOn,
      shares: {
        create: split.shares.map((share) => ({
          userId: share.userId,
          amount: paisaToDecimalString(share.paisa),
          // The payer settled their own portion the moment they paid the bill.
          // Leaving it PENDING would show them owing money they have already
          // spent, and would inflate what the house appears to be owed.
          ...(share.userId === paidById
            ? { status: "PAID" as const, settledAt: now }
            : {}),
        })),
      },
    },
    include: EXPENSE_INCLUDE,
  });

  return ok({ expense: toWalletExpense(expense) }, 201);
});

type SettleBody = { shareId?: string; status?: ShareStatus };

const SETTLE_STATUSES: ShareStatus[] = ["PENDING", "PAID", "WAIVED"];

/**
 * Settle a ledger row — the "who has paid and who is pending" half of the
 * requirement.
 *
 * Only the status is written. `settled_at` is stamped and cleared by the
 * expense_shares_sync_settled_at trigger, so the timestamp stays honest no
 * matter which code path flips the row.
 */
export const PATCH = withUser(async (user, req: Request) => {
  const body = await readJson<SettleBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["shareId", "status"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  const status = body.status as ShareStatus;
  if (!SETTLE_STATUSES.includes(status)) {
    return badRequest(`status must be one of: ${SETTLE_STATUSES.join(", ")}.`);
  }

  const existing = await assertCanSettleShare(user, String(body.shareId), status);

  // Nothing to record when nothing moved, and recording it anyway would let a
  // double-click pad the history of a disputed row.
  if (existing.status === status) {
    return badRequest(`That share is already ${SHARE_STATUS_LABELS[status].toLowerCase()}.`);
  }

  // One transaction: a status change that left no trail would be exactly the
  // gap the trail exists to close.
  const [share] = await prisma.$transaction([
    prisma.expenseShare.update({
      where: { id: String(body.shareId) },
      data: { status },
      include: { user: { select: { name: true } } },
    }),
    prisma.expenseShareEvent.create({
      data: {
        shareId: String(body.shareId),
        actorId: user.id,
        fromStatus: existing.status,
        toStatus: status,
        note: existing.userId === user.id ? "Settled their own share" : "Settled by house admin",
      },
    }),
  ]);

  return ok({
    share: {
      id: share.id,
      userId: share.userId,
      userName: share.user.name,
      amount: asTaka(share.amount),
      status: share.status,
      settledAt: share.settledAt,
    },
  });
});
