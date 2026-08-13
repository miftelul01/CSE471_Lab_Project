import type { ExpenseCategory, ShareStatus, SplitMethod } from "@prisma/client";

/**
 * Shared domain logic for M2.1 Shared Wallet & Bill-Splitting — Miftelul Mehebub.
 *
 * ── WHY THE MONEY IS COUNTED IN PAISA ───────────────────────────────────────
 * Splitting ৳100 three ways in floating point gives 33.333333333333336 three
 * times, which stores as 33.33 and leaves the ledger one paisa short of the
 * bill forever. Every calculation here therefore works in whole paisa
 * (integers), and the leftover paisa from a division are handed out one each
 * rather than dropped — so the shares always sum EXACTLY to the total.
 *
 * The same functions run on the server (app/api/expenses/route.ts, which is
 * the authority) and in the add-expense form's live preview. Sharing them is
 * what stops the preview and the stored ledger from ever disagreeing.
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ── Vocabulary ─────────────────────────────────────────────────────────── */

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "RENT",
  "UTILITIES",
  "GROCERIES",
  "MAINTENANCE",
  "OTHER",
];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  RENT: "Rent",
  UTILITIES: "Utilities",
  GROCERIES: "Groceries",
  MAINTENANCE: "Maintenance",
  OTHER: "Other",
};

export const SPLIT_METHODS: SplitMethod[] = ["EQUAL", "CUSTOM", "SHARES"];

export const SPLIT_METHOD_LABELS: Record<SplitMethod, string> = {
  EQUAL: "Split equally",
  CUSTOM: "Custom amount each",
  SHARES: "Custom ratio",
};

export const SPLIT_METHOD_HINTS: Record<SplitMethod, string> = {
  EQUAL: "Everyone in the house pays the same. Odd paisa go to the first housemates listed.",
  CUSTOM: "Type each person's exact taka. They must add up to the total.",
  SHARES: "Give each person a weight — 2 and 1 means the first pays twice as much. Use 0 to leave someone out.",
};

export const SHARE_STATUS_LABELS: Record<ShareStatus, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  WAIVED: "Waived",
};

/* ── Money ──────────────────────────────────────────────────────────────── */

/** Largest value the `Decimal(12, 2)` amount columns can hold, in paisa. */
export const MAX_PAISA = 999_999_999_999;

/**
 * The text columns are Postgres `text`, so the database will accept a title of
 * any size. Left unbounded, one paste turns every wallet view in the house
 * into a wall of text — so the bound is enforced here instead.
 */
export const MAX_TITLE_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 1000;

/** Most expenses a single wallet read will return, however many are asked for. */
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;

/**
 * Upper bound on a ratio weight. Not a UI nicety — `splitByWeightsPaisa`
 * multiplies the total by a weight, and this keeps that product inside the
 * range where integer arithmetic in a JS number is still exact.
 */
export const MAX_WEIGHT = 1000;

/** Anything Prisma might hand us for a Decimal column. */
type Decimalish = { toString(): string };

/** Reads a Decimal column as an ordinary number of taka. */
export const asTaka = (value: Decimalish): number => Number(value.toString());

/**
 * Parses user input into whole paisa, or null if it isn't money.
 *
 * Deliberately parses the *text* rather than multiplying by 100: at these
 * magnitudes `amount * 100` carries enough floating-point error that a
 * tolerance check would reject perfectly good input. Digits don't lie.
 */
export function toPaisa(input: unknown, opts: { allowZero?: boolean } = {}): number | null {
  if (typeof input !== "number" && typeof input !== "string") return null;

  // String(1e21) is "1e+21" and String(-5) carries a sign — both fall through
  // the pattern, which is correct: no ledger row here is ever negative.
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(input).trim());
  if (!match) return null;

  const paisa = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(paisa) || paisa > MAX_PAISA) return null;
  if (paisa === 0 && !opts.allowZero) return null;
  return paisa;
}

/** Paisa back to the exact decimal string Prisma stores. */
export function paisaToDecimalString(paisa: number): string {
  return `${Math.floor(paisa / 100)}.${String(paisa % 100).padStart(2, "0")}`;
}

export const paisaToTaka = (paisa: number): number => paisa / 100;

/**
 * Taka back to paisa, for figures that came out of the database.
 *
 * Safe where `toPaisa` is careful, because a `Decimal(12, 2)` never carries
 * more than two decimal places — there is nothing here to round away.
 */
export const takaToPaisa = (taka: number): number => Math.round(taka * 100);

export function formatTaka(amount: number): string {
  return `৳${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/* ── Dates ──────────────────────────────────────────────────────────────── */

/**
 * Today's date in Dhaka (UTC+6), as UTC midnight.
 *
 * `spentOn` is a DATE column, and the server runs in UTC. Taking the server's
 * own date would file an expense entered at 1am in Dhaka under the previous
 * day, and would let that same expense be rejected as "in the future".
 */
export function dhakaToday(): Date {
  const now = new Date(Date.now() + 6 * 60 * 60 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** The same day as `YYYY-MM-DD`, for a date input's value. */
export const dhakaTodayISO = (): string => dhakaToday().toISOString().slice(0, 10);

/* ── The split ──────────────────────────────────────────────────────────── */

/**
 * Divides `totalPaisa` into `count` parts that sum to exactly `totalPaisa`.
 * The remainder is spread one paisa at a time over the earliest parts, so at
 * worst one housemate pays a single paisa more than another.
 */
export function splitEqualPaisa(totalPaisa: number, count: number): number[] {
  const base = Math.floor(totalPaisa / count);
  const remainder = totalPaisa - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Divides `totalPaisa` in proportion to `weights`, again summing to exactly
 * `totalPaisa`. Uses the largest-remainder method: everyone takes their floor,
 * then the paisa left over go to whoever was rounded down hardest. Ties break
 * on position so the result is deterministic.
 */
export function splitByWeightsPaisa(totalPaisa: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  const parts: number[] = [];
  const shortfall: { index: number; remainder: number }[] = [];
  let assigned = 0;

  weights.forEach((weight, index) => {
    const exact = totalPaisa * weight;
    const whole = Math.floor(exact / totalWeight);
    parts.push(whole);
    assigned += whole;
    shortfall.push({ index, remainder: exact - whole * totalWeight });
  });

  // Each floor loses less than one paisa, so there are always fewer paisa left
  // over than there are people — this can't run off the end of the list.
  shortfall.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < totalPaisa - assigned; i++) parts[shortfall[i].index] += 1;

  return parts;
}

export type SplitInput = {
  method: SplitMethod;
  totalPaisa: number;
  /** Who the bill is divided between, in the order they should be listed. */
  memberIds: string[];
  /** CUSTOM: taka per member. SHARES: an integer weight per member. Ignored by EQUAL. */
  allocations?: Record<string, unknown>;
};

export type SplitResult = { userId: string; paisa: number }[];

/** Reads one entry out of `allocations`, treating a blank box as zero. */
function allocationText(allocations: Record<string, unknown> | undefined, userId: string): string {
  const raw = allocations?.[userId];
  if (raw === undefined || raw === null || String(raw).trim() === "") return "0";
  return String(raw).trim();
}

/**
 * Works out what each housemate owes. Returns either the shares or a message
 * safe to show the person filling in the form.
 */
export function buildSplit(input: SplitInput): { shares: SplitResult } | { error: string } {
  const { method, totalPaisa, memberIds, allocations } = input;

  if (memberIds.length === 0) {
    return { error: "This house has no active members to split the bill between." };
  }

  if (method === "EQUAL") {
    const parts = splitEqualPaisa(totalPaisa, memberIds.length);
    return { shares: memberIds.map((userId, i) => ({ userId, paisa: parts[i] })) };
  }

  if (method === "CUSTOM") {
    const parts: number[] = [];
    for (const userId of memberIds) {
      const paisa = toPaisa(allocationText(allocations, userId), { allowZero: true });
      if (paisa === null) {
        return { error: "Each amount must be a positive number with at most 2 decimal places." };
      }
      parts.push(paisa);
    }

    const sum = parts.reduce((a, b) => a + b, 0);
    if (sum !== totalPaisa) {
      const difference = formatTaka(paisaToTaka(Math.abs(totalPaisa - sum)));
      return {
        error:
          sum > totalPaisa
            ? `Those amounts are ${difference} more than the total.`
            : `Those amounts are ${difference} short of the total.`,
      };
    }
    return { shares: memberIds.map((userId, i) => ({ userId, paisa: parts[i] })) };
  }

  // SHARES — a ratio rather than fixed amounts, so it stays correct if the
  // total is later corrected.
  const weights: number[] = [];
  for (const userId of memberIds) {
    const weight = Number(allocationText(allocations, userId));
    if (!Number.isInteger(weight) || weight < 0 || weight > MAX_WEIGHT) {
      return { error: `Each ratio must be a whole number from 0 to ${MAX_WEIGHT}.` };
    }
    weights.push(weight);
  }

  if (weights.reduce((a, b) => a + b, 0) === 0) {
    return { error: "At least one housemate needs a ratio above zero." };
  }

  const parts = splitByWeightsPaisa(totalPaisa, weights);
  return { shares: memberIds.map((userId, i) => ({ userId, paisa: parts[i] })) };
}

/* ── The ledger ─────────────────────────────────────────────────────────── */

/**
 * Plain (JSON-safe) versions of the wallet rows. Prisma hands back `Decimal`
 * instances, which are class instances and so cannot cross the boundary into a
 * client component — the page converts once, here, and everything downstream
 * works in ordinary numbers.
 */
export type WalletShare = {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  status: ShareStatus;
  settledAt: Date | null;
  /**
   * True when a real gateway payment settled this row. Such a row must not be
   * hand-edited back to pending — the money genuinely moved, and only a refund
   * can undo that.
   */
  settledByPayment: boolean;
  /** The most recent movement of this row, for "marked paid by … " captions. */
  lastEvent: { actorName: string | null; note: string | null; at: Date } | null;
};

export type WalletExpense = {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  category: ExpenseCategory;
  splitMethod: SplitMethod;
  spentOn: Date;
  createdById: string;
  createdByName: string;
  /**
   * Who put the money down — the person the rest of the house reimburses.
   * Null for an expense nobody paid out of pocket, which takes no part in the
   * "who owes whom" calculation.
   */
  paidById: string | null;
  paidByName: string | null;
  shares: WalletShare[];
};

/**
 * The relations every wallet read needs. Shared so the page, the list endpoint
 * and the single-expense endpoint cannot drift into loading different data and
 * rendering different answers.
 *
 * It lives here rather than in a route module because Next.js only permits the
 * HTTP verbs and its own segment config to be exported from a route file.
 */
export const EXPENSE_INCLUDE = {
  paidBy: { select: { name: true } },
  shares: {
    include: {
      user: { select: { name: true } },
      // Successful payments only — a share a gateway settled may not be
      // hand-edited, and the UI needs to know in order to hide the control.
      payments: { where: { status: "SUCCEEDED" as const }, select: { id: true }, take: 1 },
      // Just the latest movement — enough to answer "who marked this paid?"
      // without loading a whole history nobody asked to see.
      events: {
        select: { toStatus: true, note: true, createdAt: true, actor: { select: { name: true } } },
        orderBy: { createdAt: "desc" as const },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
  createdBy: { select: { name: true } },
} as const;

/** The shape `toWalletExpense` needs — structural, so a Prisma row just fits. */
type ExpenseRow = {
  id: string;
  title: string;
  description: string | null;
  amount: Decimalish;
  category: ExpenseCategory;
  splitMethod: SplitMethod;
  spentOn: Date;
  createdById: string;
  createdBy: { name: string };
  paidById: string | null;
  paidBy: { name: string } | null;
  shares: {
    id: string;
    userId: string;
    amount: Decimalish;
    status: ShareStatus;
    settledAt: Date | null;
    user: { name: string };
    /** Successful payments only — the query is expected to filter on status. */
    payments: { id: string }[];
    /** Newest first, and the query is expected to take only what it needs. */
    events: { note: string | null; createdAt: Date; actor: { name: string } | null }[];
  }[];
};

export function toWalletExpense(row: ExpenseRow): WalletExpense {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    amount: asTaka(row.amount),
    category: row.category,
    splitMethod: row.splitMethod,
    spentOn: row.spentOn,
    createdById: row.createdById,
    createdByName: row.createdBy.name,
    paidById: row.paidById,
    paidByName: row.paidBy?.name ?? null,
    shares: row.shares.map((share) => ({
      id: share.id,
      userId: share.userId,
      userName: share.user.name,
      amount: asTaka(share.amount),
      status: share.status,
      settledAt: share.settledAt,
      settledByPayment: share.payments.length > 0,
      lastEvent: share.events[0]
        ? {
            actorName: share.events[0].actor?.name ?? null,
            note: share.events[0].note,
            at: share.events[0].createdAt,
          }
        : null,
    })),
  };
}

/**
 * Whether an expense can still be removed.
 *
 * Once anyone has settled, the row is a record of money that actually changed
 * hands — deleting it would erase that. Correct a mistake before it is paid,
 * or waive the remaining shares afterwards.
 */
export function isExpenseDeletable(expense: WalletExpense): boolean {
  // Mirrors assertCanDeleteExpense. The payer's own share is settled from the
  // start by definition, so it is not what stops a deletion — somebody else
  // having actually handed money over is.
  return expense.shares.every(
    (share) =>
      !share.settledByPayment &&
      (share.status !== "PAID" || share.userId === expense.paidById)
  );
}

/** One housemate's standing in the house ledger. All figures in taka. */
export type LedgerRow = {
  userId: string;
  name: string;
  /** Total the house has ever charged them. */
  owed: number;
  paid: number;
  pending: number;
  waived: number;
  /** Total of the bills they paid for out of their own pocket. */
  fronted: number;
  /**
   * What the house owes them right now, net of what they still owe it.
   * Positive means the house is in their debt; negative means they are in the
   * house's. Across the whole house these sum to zero.
   */
  net: number;
};

export type LedgerTotals = {
  spent: number;
  paid: number;
  pending: number;
  waived: number;
};

/* ── Who owes whom ──────────────────────────────────────────────────────── */

/**
 * Every housemate's outstanding balance, in paisa, keyed by user id.
 *
 * Read one expense at a time: the payer put the whole amount down, so everyone
 * else with an unsettled share owes them that share. A share already PAID has
 * been reimbursed; a WAIVED one has been forgiven and the payer has absorbed
 * it. Neither is still a debt, so neither appears here.
 *
 * Positive means the house owes that person. The values always sum to zero,
 * which is the invariant the settlement plan below depends on.
 */
export function outstandingBalances(expenses: WalletExpense[]): Map<string, number> {
  const balances = new Map<string, number>();
  const move = (userId: string, paisa: number) =>
    balances.set(userId, (balances.get(userId) ?? 0) + paisa);

  for (const expense of expenses) {
    // Nobody fronted this one, so there is nobody to reimburse. Its shares are
    // still real charges; they just aren't a debt between two housemates.
    const payer = expense.paidById;
    if (!payer) continue;

    for (const share of expense.shares) {
      // The payer's own share is money they owe themselves.
      if (share.status !== "PENDING" || share.userId === payer) continue;
      const paisa = takaToPaisa(share.amount);
      move(payer, paisa);
      move(share.userId, -paisa);
    }
  }
  return balances;
}

/** One suggested transfer: `from` hands `amount` to `to`. */
export type Settlement = {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amount: number;
};

/**
 * The shortest list of payments that clears every debt in the house.
 *
 * Rather than have everyone reimburse every payer separately — which is what
 * the raw share list implies, and is O(n²) handovers — this repeatedly settles
 * the largest creditor against the largest debtor. Each transfer zeroes at
 * least one person, so at most n−1 payments are ever needed.
 *
 * The greedy choice is not provably the true minimum in every case (the exact
 * problem is NP-hard), but it never does worse than n−1 and matches the
 * optimum for the small, everyday cases a household actually has.
 *
 * Runs entirely in paisa: a plan that doesn't add up to the debts it clears
 * would be worse than no plan at all.
 */
export function settlementPlan(
  expenses: WalletExpense[],
  nameOf: (userId: string) => string
): Settlement[] {
  const entries = [...outstandingBalances(expenses)].filter(([, paisa]) => paisa !== 0);

  // Sorted by id as the tiebreak so an unchanged ledger always renders the
  // same plan, rather than shuffling on every refresh.
  const creditors = entries
    .filter(([, paisa]) => paisa > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([userId, paisa]) => ({ userId, paisa }));
  const debtors = entries
    .filter(([, paisa]) => paisa < 0)
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([userId, paisa]) => ({ userId, paisa: -paisa }));

  const plan: Settlement[] = [];
  let c = 0;
  let d = 0;

  while (c < creditors.length && d < debtors.length) {
    const amount = Math.min(creditors[c].paisa, debtors[d].paisa);
    plan.push({
      fromUserId: debtors[d].userId,
      fromName: nameOf(debtors[d].userId),
      toUserId: creditors[c].userId,
      toName: nameOf(creditors[c].userId),
      amount: paisaToTaka(amount),
    });

    creditors[c].paisa -= amount;
    debtors[d].paisa -= amount;
    if (creditors[c].paisa === 0) c++;
    if (debtors[d].paisa === 0) d++;
  }

  return plan;
}

/**
 * The running ledger the requirement asks for: for every housemate, how much
 * they have been charged and how much of it is settled.
 *
 * Anyone who has ever held a share is listed, not just today's members —
 * a housemate who moved out still owing money must not vanish from the books.
 * Current members come first, in the order they joined.
 */
export function summarizeLedger(
  members: { userId: string; name: string }[],
  expenses: WalletExpense[]
): { rows: LedgerRow[]; totals: LedgerTotals } {
  const blank = (userId: string, name: string): LedgerRow => ({
    userId,
    name,
    owed: 0,
    paid: 0,
    pending: 0,
    waived: 0,
    fronted: 0,
    net: 0,
  });

  const rows = new Map<string, LedgerRow>();
  const order: string[] = [];

  const rowFor = (userId: string, name: string) => {
    let row = rows.get(userId);
    if (!row) {
      row = blank(userId, name);
      rows.set(userId, row);
      order.push(userId);
    }
    // A name is only worth taking from a share if we seeded the row without one.
    if (!row.name) row.name = name;
    return row;
  };

  for (const member of members) rowFor(member.userId, member.name);

  const totals: LedgerTotals = { spent: 0, paid: 0, pending: 0, waived: 0 };

  for (const expense of expenses) {
    totals.spent += expense.amount;
    if (expense.paidById) {
      rowFor(expense.paidById, expense.paidByName ?? "").fronted += expense.amount;
    }

    for (const share of expense.shares) {
      const row = rowFor(share.userId, share.userName);
      row.owed += share.amount;
      if (share.status === "PAID") {
        row.paid += share.amount;
        totals.paid += share.amount;
      } else if (share.status === "WAIVED") {
        row.waived += share.amount;
        totals.waived += share.amount;
      } else {
        row.pending += share.amount;
        totals.pending += share.amount;
      }
    }
  }

  // Net position comes from the outstanding-debt graph rather than
  // (fronted − charged), because a settled or waived share is no longer a debt
  // and must not keep showing up as one.
  for (const [userId, paisa] of outstandingBalances(expenses)) {
    const row = rows.get(userId);
    if (row) row.net = paisaToTaka(paisa);
  }

  const memberIds = new Set(members.map((m) => m.userId));
  const listed = order.map((id) => rows.get(id)!);

  // Current members in join order, then everyone else alphabetically.
  return {
    rows: [
      ...listed.filter((row) => memberIds.has(row.userId)),
      ...listed
        .filter((row) => !memberIds.has(row.userId))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ],
    totals,
  };
}
