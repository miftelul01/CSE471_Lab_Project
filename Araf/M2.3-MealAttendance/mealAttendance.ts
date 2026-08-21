import { AttendanceStatus, MealType, Prisma } from "@prisma/client";

import { HttpError } from "@/lib/api";
import { AuthzError, isHouseAdmin } from "@/lib/authz";
import { dateForDay, mondayOf } from "@/lib/menu";
import { prisma } from "@/lib/prisma";

/**
 * M2.3 Meal Attendance & Auto-Quantity Adjustment — Md. Mahidul Alam Araf.
 *
 * ── DATES ───────────────────────────────────────────────────────────────────
 * `mealDate` is a DATE column, and every date here is pinned to UTC midnight.
 * The week boundary comes from lib/menu's mondayOf rather than being computed
 * again locally: the approved menu for a week is keyed on that exact value, so
 * a second implementation of "which Monday is this" would silently stop
 * matching on any server whose timezone is not UTC.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const MEAL_TYPES: MealType[] = ["BREAKFAST", "LUNCH", "DINNER"];
export const DEFAULT_MEAL_WINDOW_DAYS = 4;

/** A meal costing more than this is a typo, not a mess bill. */
export const MAX_COST_PER_HEAD = 100_000;
/** How far either side of today a meal slot may be created. */
const MAX_SLOT_DRIFT_DAYS = 366;

type MealAttendanceRow = {
  id: string;
  userId: string;
  status: AttendanceStatus;
  user: { id: string; name: string };
};

type MealRow = {
  id: string;
  houseId: string;
  mealDate: Date;
  mealType: MealType;
  dayProposalId: string | null;
  costPerHead: Prisma.Decimal | null;
  headcount: number;
  locksAt: Date | null;
  attendance: MealAttendanceRow[];
  dayProposal: { breakfast: string | null; lunch: string | null; dinner: string | null } | null;
  ratings: { userId: string; stars: number }[];
};

export type MealAttendanceView = {
  id: string;
  mealDate: string;
  mealType: MealType;
  mealLabel: string;
  menuProposalTitle: string | null;
  costPerHead: number | null;
  headcount: number;
  locksAt: string | null;
  locked: boolean;
  myAttendance: AttendanceStatus;
  /** Post-Meal Satisfaction Rating (M2.2 scoped enhancement) — the caller's own 1-5 rating, once given. */
  myRating: number | null;
  attendees: Array<{ id: string; userId: string; name: string; status: AttendanceStatus }>;
};

export type MealAttendancePageData = {
  house: { id: string; name: string };
  canManageMeals: boolean;
  meals: MealAttendanceView[];
};

const MEAL_INCLUDE = {
  attendance: { include: { user: { select: { id: true, name: true } } } },
  dayProposal: { select: { breakfast: true, lunch: true, dinner: true } },
  ratings: { select: { userId: true, stars: true } },
} as const;

/* ── Dates ──────────────────────────────────────────────────────────────── */

function normalizeMealDate(value: Date | string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError("That isn't a valid date.", 400);
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

/** Last instant of that UTC day — the default moment attendance stops changing. */
function endOfDay(value: Date): Date {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

const dateKey = (value: Date): string => value.toISOString().slice(0, 10);

function formatMealLabel(mealDate: Date, mealType: MealType): string {
  const dateLabel = mealDate.toLocaleDateString("en-GB", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${mealType.toLowerCase()} - ${dateLabel}`;
}

const mealExpenseTitle = (mealDate: Date, mealType: MealType): string =>
  `${mealType.toLowerCase()} meal - ${dateKey(mealDate)}`;

/* ── Validation ─────────────────────────────────────────────────────────── */

export type MealSlotInput = {
  mealDate: string;
  mealType: MealType;
  costPerHead?: number | string | null;
  locksAt?: string | null;
  dayProposalId?: string | null;
};

type ValidatedMealSlot = {
  mealDate: Date;
  mealType: MealType;
  costPerHead: Prisma.Decimal | null;
  locksAt: Date;
  dayProposalId: string | null;
};

/**
 * Everything from the request body is checked here, before Prisma sees it.
 *
 * Without this an unknown meal type, a malformed date or a negative cost each
 * reached the database and came back as a 500 carrying the raw Postgres error
 * — which, for a CHECK violation, includes a dump of the failing row.
 */
export function validateMealSlot(input: MealSlotInput): ValidatedMealSlot {
  if (!input?.mealType || !MEAL_TYPES.includes(input.mealType)) {
    throw new HttpError(`mealType must be one of: ${MEAL_TYPES.join(", ")}.`, 400);
  }

  const mealDate = normalizeMealDate(input.mealDate);
  const today = normalizeMealDate(new Date());
  const drift = Math.abs(mealDate.getTime() - today.getTime()) / 86_400_000;
  if (drift > MAX_SLOT_DRIFT_DAYS) {
    throw new HttpError("That date is too far from today to plan a meal for.", 400);
  }

  let locksAt = endOfDay(mealDate);
  if (input.locksAt) {
    const parsed = new Date(input.locksAt);
    if (Number.isNaN(parsed.getTime())) throw new HttpError("locksAt isn't a valid date.", 400);
    locksAt = parsed;
  }

  let costPerHead: Prisma.Decimal | null = null;
  const raw = input.costPerHead;
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      throw new HttpError("Cost per head must be zero or more.", 400);
    }
    if (value > MAX_COST_PER_HEAD) {
      throw new HttpError(`Cost per head must be ${MAX_COST_PER_HEAD} or less.`, 400);
    }
    if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
      throw new HttpError("Cost per head can have at most 2 decimal places.", 400);
    }
    costPerHead = new Prisma.Decimal(value.toFixed(2));
  }

  return {
    mealDate,
    mealType: input.mealType,
    costPerHead,
    locksAt,
    dayProposalId: input.dayProposalId ?? null,
  };
}

/* ── Wallet sync (M2.1 integration) ─────────────────────────────────────── */

type ShareRow = {
  id: string;
  userId: string;
  amount: Prisma.Decimal;
  status: string;
  payments: { id: string }[];
};

/**
 * A share nobody can silently rewrite: it has been marked paid, or a real
 * gateway payment is attached to it. Money moved, so the row is history.
 */
const isSettled = (share: ShareRow) => share.status === "PAID" || share.payments.length > 0;

const sumOf = (shares: { amount: Prisma.Decimal }[]) =>
  shares.reduce((total, share) => total.plus(share.amount), new Prisma.Decimal(0));

/**
 * Brings the meal's wallet expense in line with who is actually eating.
 *
 * ── WHY THIS IS NOT A DELETE-AND-REBUILD ────────────────────────────────────
 * It used to delete every share on the expense and recreate them all as
 * PENDING. That meant one resident toggling their own attendance silently
 * reverted everybody else's settled rows: a share marked paid went back to
 * unpaid, its audit trail was cascade-deleted, and a successful bKash payment
 * had its expense_share_id set to NULL — the money was taken and the ledger
 * forgot.
 *
 * So the reconciliation is now surgical. Settled shares are never touched, not
 * repriced and not removed, even if that resident has since decided to skip:
 * you cannot un-charge someone who has already handed the money over. Only
 * unsettled rows are added, repriced, or dropped. The expense total is then
 * recomputed from the rows that actually remain, which keeps the invariant the
 * whole wallet rests on — an expense's amount equals the sum of its shares.
 * ────────────────────────────────────────────────────────────────────────────
 */
async function syncMealExpense(tx: Prisma.TransactionClient, mealId: string, actorId: string) {
  const meal = await tx.meal.findUnique({
    where: { id: mealId },
    select: {
      id: true,
      houseId: true,
      mealDate: true,
      mealType: true,
      costPerHead: true,
      attendance: { select: { userId: true, status: true } },
    },
  });
  if (!meal) return;

  const expense = await tx.expense.findUnique({
    where: { mealId },
    select: {
      id: true,
      shares: {
        select: {
          id: true,
          userId: true,
          amount: true,
          status: true,
          payments: { where: { status: "SUCCEEDED" }, select: { id: true }, take: 1 },
        },
      },
    },
  });

  const attending = meal.attendance
    .filter((entry) => entry.status === AttendanceStatus.ATTENDING)
    .map((entry) => entry.userId);
  const costPerHead = meal.costPerHead;
  const title = mealExpenseTitle(meal.mealDate, meal.mealType);

  // No price set, or nobody eating: there is nothing left to charge. Anything
  // already settled still stands.
  if (!costPerHead || costPerHead.lte(0) || attending.length === 0) {
    if (!expense) return;

    const keep = expense.shares.filter(isSettled);
    const drop = expense.shares.filter((share) => !isSettled(share)).map((share) => share.id);
    if (drop.length > 0) await tx.expenseShare.deleteMany({ where: { id: { in: drop } } });

    if (keep.length === 0) {
      await tx.expense.delete({ where: { id: expense.id } });
      return;
    }
    await tx.expense.update({ where: { id: expense.id }, data: { amount: sumOf(keep), title } });
    return;
  }

  if (!expense) {
    await tx.expense.create({
      data: {
        houseId: meal.houseId,
        createdById: actorId,
        // Deliberately no paidById: the mess fronted this, not one housemate,
        // so it takes no part in "who owes whom".
        mealId: meal.id,
        title,
        amount: costPerHead.mul(attending.length),
        category: "GROCERIES",
        splitMethod: "EQUAL",
        spentOn: meal.mealDate,
        shares: { create: attending.map((userId) => ({ userId, amount: costPerHead })) },
      },
    });
    return;
  }

  const attendingSet = new Set(attending);
  const byUser = new Map(expense.shares.map((share) => [share.userId, share]));

  const settledShares: ShareRow[] = [];
  const toDelete: string[] = [];
  const toReprice: string[] = [];

  for (const share of expense.shares) {
    if (isSettled(share)) {
      settledShares.push(share);
      continue;
    }
    if (!attendingSet.has(share.userId)) {
      toDelete.push(share.id);
      continue;
    }
    if (!share.amount.equals(costPerHead)) toReprice.push(share.id);
  }

  const toCreate = attending
    .filter((userId) => !byUser.has(userId))
    .map((userId) => ({ expenseId: expense.id, userId, amount: costPerHead }));

  if (toDelete.length > 0) await tx.expenseShare.deleteMany({ where: { id: { in: toDelete } } });
  if (toReprice.length > 0) {
    await tx.expenseShare.updateMany({ where: { id: { in: toReprice } }, data: { amount: costPerHead } });
  }
  if (toCreate.length > 0) await tx.expenseShare.createMany({ data: toCreate, skipDuplicates: true });

  // Settled rows keep whatever was actually paid; everyone else attending is
  // on the current price. Together those are exactly the rows that survive.
  const unsettledAttending = attending.filter((userId) => {
    const existing = byUser.get(userId);
    return !existing || !isSettled(existing);
  }).length;

  await tx.expense.update({
    where: { id: expense.id },
    data: {
      title,
      spentOn: meal.mealDate,
      amount: sumOf(settledShares).plus(costPerHead.mul(unsettledAttending)),
    },
  });
}

/* ── Reading ────────────────────────────────────────────────────────────── */

/** e.g. "Khichuri / Beef curry" from whichever of breakfast/lunch/dinner the winning candidate filled in. */
function dayProposalTitle(proposal: MealRow["dayProposal"]): string | null {
  if (!proposal) return null;
  const parts = [proposal.breakfast, proposal.lunch, proposal.dinner].filter((v): v is string => !!v);
  return parts.length > 0 ? parts.join(" / ") : null;
}
function mapMealRow(meal: MealRow, userId: string): MealAttendanceView {
  const myAttendance =
    meal.attendance.find((entry) => entry.userId === userId)?.status ?? AttendanceStatus.ATTENDING;

  return {
    id: meal.id,
    mealDate: meal.mealDate.toISOString(),
    mealType: meal.mealType,
    mealLabel: formatMealLabel(meal.mealDate, meal.mealType),
    menuProposalTitle: dayProposalTitle(meal.dayProposal),
    costPerHead: meal.costPerHead ? Number(meal.costPerHead) : null,
    headcount: meal.headcount,
    locksAt: meal.locksAt ? meal.locksAt.toISOString() : null,
    locked: meal.locksAt ? meal.locksAt.getTime() < Date.now() : false,
    myAttendance,
    myRating: meal.ratings.find((r) => r.userId === userId)?.stars ?? null,
    attendees: meal.attendance.map((entry) => ({
      id: entry.id,
      userId: entry.userId,
      name: entry.user.name,
      status: entry.status,
    })),
  };
}

/**
 * Makes sure the next few days have meal slots and that every current member
 * is on each roster.
 *
 * ── WHY THIS IS NOT ONE BIG TRANSACTION ─────────────────────────────────────
 * It used to open a single interactive transaction and then run roughly eighty
 * queries inside it, one meal at a time, re-syncing the wallet for every slot
 * on every page load. Against a hosted database that took over five seconds
 * and blew Prisma's transaction timeout, so GET /api/meals answered 500 — the
 * page simply did not load. It also meant a plain read rewrote the ledger.
 *
 * Now it is a handful of set-based queries, and the wallet is only touched
 * when the roster actually moved and the meal has a price. `skipDuplicates`
 * covers two people opening the page at the same moment.
 *
 * ── KNOWN AND ACCEPTED: THIS RUNS ON A GET ──────────────────────────────────
 * Reached from `GET /api/meals`, so a plain read creates meal rows, prunes
 * attendance for departed members, and can rewrite expense shares. That is a
 * deliberate trade, not an oversight, and it was reviewed as one:
 *
 *   - The upside is that the board is always populated. Nobody has to
 *     remember to "open" the week, and a house that never touches the admin
 *     screen still gets a working roster.
 *   - The cost is that a prefetch, a link-preview crawler or a double refresh
 *     can trigger those writes. Every one of them is idempotent — set-based,
 *     `skipDuplicates`, and settled shares are never repriced or removed — so
 *     a repeat produces no second effect.
 *
 * If this ever needs to become a pure read, the move is to call
 * ensureMealWindow from `POST /api/meals` and the nightly cron instead, and
 * accept that the board is empty until one of them has run.
 * ────────────────────────────────────────────────────────────────────────────
 */
async function ensureMealWindow(
  houseId: string,
  actorId: string,
  startDate: Date,
  days = DEFAULT_MEAL_WINDOW_DAYS
) {
  const dates = Array.from({ length: days }, (_, offset) => addDays(startDate, offset));
  const first = dates[0];
  const last = dates[dates.length - 1];

  const [activeMembers, decidedResults, existingMeals] = await Promise.all([
    prisma.houseMember.findMany({ where: { houseId, status: "ACTIVE" }, select: { userId: true } }),
    // M2.2 decides one winning candidate PER DAY (not per week) — see
    // lib/menu.ts advanceDailyVote. DECIDED carries a real winner; FALLBACK
    // may carry one too (the previous week's winner for that exact day) or
    // null (falls through to the house's default safe meal, shown with no
    // linked candidate).
    prisma.dailyMealResult.findMany({
      where: {
        houseId,
        status: { in: ["DECIDED", "FALLBACK"] },
        weekStartDate: { gte: mondayOf(first), lte: mondayOf(last) },
      },
      select: { weekStartDate: true, dayOfWeek: true, winningProposalId: true },
    }),
    prisma.meal.findMany({
      where: { houseId, mealDate: { gte: first, lte: last } },
      select: { id: true, mealDate: true, mealType: true },
    }),
  ]);

  const winningProposalByDate = new Map(
    decidedResults.map((r) => [dateKey(dateForDay(r.weekStartDate, r.dayOfWeek)), r.winningProposalId])
  );
  const present = new Set(existingMeals.map((m) => `${dateKey(m.mealDate)}|${m.mealType}`));

  const missingMeals = dates.flatMap((mealDate) =>
    MEAL_TYPES.filter((mealType) => !present.has(`${dateKey(mealDate)}|${mealType}`)).map(
      (mealType) => ({
        houseId,
        mealDate,
        mealType,
        dayProposalId: winningProposalByDate.get(dateKey(mealDate)) ?? null,
        locksAt: endOfDay(mealDate),
      })
    )
  );

  if (missingMeals.length > 0) {
    await prisma.meal.createMany({ data: missingMeals, skipDuplicates: true });
  }

  // Re-read: createMany returns no ids, and skipDuplicates hides which of two
  // concurrent callers actually inserted the row.
  const meals = await prisma.meal.findMany({
    where: { houseId, mealDate: { gte: first, lte: last } },
    select: { id: true, costPerHead: true },
  });

  const attendance = await prisma.mealAttendance.findMany({
    where: { mealId: { in: meals.map((m) => m.id) } },
    select: { id: true, mealId: true, userId: true },
  });

  const memberIds = activeMembers.map((m) => m.userId);
  const memberSet = new Set(memberIds);
  const rosterByMeal = new Map<string, Set<string>>();
  for (const entry of attendance) {
    if (!rosterByMeal.has(entry.mealId)) rosterByMeal.set(entry.mealId, new Set());
    rosterByMeal.get(entry.mealId)!.add(entry.userId);
  }

  const missingAttendance = meals.flatMap((meal) => {
    const roster = rosterByMeal.get(meal.id) ?? new Set<string>();
    return memberIds
      .filter((userId) => !roster.has(userId))
      .map((userId) => ({ mealId: meal.id, userId, status: AttendanceStatus.ATTENDING }));
  });

  const stale = attendance.filter((entry) => !memberSet.has(entry.userId));

  if (missingAttendance.length > 0) {
    await prisma.mealAttendance.createMany({ data: missingAttendance, skipDuplicates: true });
  }
  if (stale.length > 0) {
    await prisma.mealAttendance.deleteMany({ where: { id: { in: stale.map((e) => e.id) } } });
  }

  // Only when somebody joined or left AND there is money on that meal.
  if (missingAttendance.length > 0 || stale.length > 0) {
    const moved = new Set([
      ...missingAttendance.map((entry) => entry.mealId),
      ...stale.map((entry) => entry.mealId),
    ]);
    for (const meal of meals) {
      if (meal.costPerHead === null || !moved.has(meal.id)) continue;
      await prisma.$transaction((tx) => syncMealExpense(tx, meal.id, actorId));
    }
  }
}

/* ── Public API ─────────────────────────────────────────────────────────── */

export async function loadMealAttendancePageData(
  userId: string,
  houseId: string,
  from?: string | null
): Promise<MealAttendancePageData> {
  const startDate = normalizeMealDate(from ?? new Date());
  await ensureMealWindow(houseId, userId, startDate, DEFAULT_MEAL_WINDOW_DAYS);

  const [house, meals, canManageMeals] = await Promise.all([
    prisma.house.findUnique({ where: { id: houseId }, select: { id: true, name: true } }),
    prisma.meal.findMany({
      where: {
        houseId,
        mealDate: { gte: startDate, lt: addDays(startDate, DEFAULT_MEAL_WINDOW_DAYS) },
      },
      include: MEAL_INCLUDE,
      orderBy: [{ mealDate: "asc" }, { mealType: "asc" }],
    }),
    isHouseAdmin(userId, houseId),
  ]);

  if (!house) throw new AuthzError("No such house", 404);

  return { house, canManageMeals, meals: meals.map((meal) => mapMealRow(meal, userId)) };
}

export async function saveMealSlot(userId: string, houseId: string, input: MealSlotInput) {
  const valid = validateMealSlot(input);

  /**
   * A meal may only be linked to this house's own menu.
   *
   * The foreign key guarantees the proposal exists; it says nothing about who
   * it belongs to. Without this check a house admin could pass any proposal id
   * and have another household's menu title rendered on their board — every
   * other cross-entity reference in the codebase is house-scoped, and this one
   * was the exception.
   */
  if (valid.dayProposalId) {
    const proposal = await prisma.dayProposal.findFirst({
      where: { id: valid.dayProposalId, houseId },
      select: { id: true },
    });
    if (!proposal) {
      throw new HttpError("That meal proposal doesn't belong to your house.", 400);
    }
  }

  return prisma.$transaction(async (tx) => {
    const meal = await tx.meal.upsert({
      where: {
        houseId_mealDate_mealType: {
          houseId,
          mealDate: valid.mealDate,
          mealType: valid.mealType,
        },
      },
      create: {
        houseId,
        mealDate: valid.mealDate,
        mealType: valid.mealType,
        costPerHead: valid.costPerHead,
        locksAt: valid.locksAt,
        dayProposalId: valid.dayProposalId,
      },
      update: {
        costPerHead: valid.costPerHead,
        locksAt: valid.locksAt,
        dayProposalId: valid.dayProposalId,
      },
      select: { id: true },
    });

    // A slot created here starts with everyone on the roster.
    const activeMembers = await tx.houseMember.findMany({
      where: { houseId, status: "ACTIVE" },
      select: { userId: true },
    });
    await tx.mealAttendance.createMany({
      data: activeMembers.map((member) => ({
        mealId: meal.id,
        userId: member.userId,
        status: AttendanceStatus.ATTENDING,
      })),
      skipDuplicates: true,
    });

    await syncMealExpense(tx, meal.id, userId);

    const refreshed = await tx.meal.findUniqueOrThrow({ where: { id: meal.id }, include: MEAL_INCLUDE });
    return mapMealRow(refreshed, userId);
  });
}

export async function changeMealAttendance(
  userId: string,
  houseId: string,
  mealId: string,
  status?: AttendanceStatus
) {
  if (status !== undefined && !Object.values(AttendanceStatus).includes(status)) {
    throw new HttpError(`status must be one of: ${Object.values(AttendanceStatus).join(", ")}.`, 400);
  }

  return prisma.$transaction(async (tx) => {
    const meal = await tx.meal.findUnique({
      where: { id: mealId },
      select: { id: true, houseId: true, locksAt: true, attendance: { select: { userId: true, status: true } } },
    });

    if (!meal) throw new AuthzError("No such meal", 404);
    // Reported as "not yours" rather than "not found" so the two cases stay
    // distinguishable to a legitimate caller without confirming ids to anyone
    // else — the house check is what actually gates it.
    if (meal.houseId !== houseId) throw new AuthzError("That meal belongs to another house.");

    if (meal.locksAt && meal.locksAt.getTime() <= Date.now()) {
      throw new HttpError("That meal is already locked.", 400);
    }

    const current =
      meal.attendance.find((entry) => entry.userId === userId)?.status ?? AttendanceStatus.ATTENDING;
    const desired =
      status ??
      (current === AttendanceStatus.ATTENDING ? AttendanceStatus.SKIPPING : AttendanceStatus.ATTENDING);

    await tx.mealAttendance.upsert({
      where: { mealId_userId: { mealId, userId } },
      create: { mealId, userId, status: desired },
      update: { status: desired },
    });

    await syncMealExpense(tx, meal.id, userId);

    const refreshed = await tx.meal.findUniqueOrThrow({ where: { id: meal.id }, include: MEAL_INCLUDE });
    return mapMealRow(refreshed, userId);
  });
}
