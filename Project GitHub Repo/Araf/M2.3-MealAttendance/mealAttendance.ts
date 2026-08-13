import { AttendanceStatus, MealType, Prisma } from "@prisma/client";

import { isHouseAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const MEAL_TYPES: MealType[] = ["BREAKFAST", "LUNCH", "DINNER"];
export const DEFAULT_MEAL_WINDOW_DAYS = 4;

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
  menuProposalId: string | null;
  costPerHead: Prisma.Decimal | null;
  headcount: number;
  locksAt: Date | null;
  attendance: MealAttendanceRow[];
  menuProposal: { title: string } | null;
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
  attendees: Array<{
    id: string;
    userId: string;
    name: string;
    status: AttendanceStatus;
  }>;
};

export type MealAttendancePageData = {
  house: { id: string; name: string };
  canManageMeals: boolean;
  meals: MealAttendanceView[];
};

function normalizeMealDate(value: Date | string): Date {
  const date = new Date(value);
  date.setHours(12, 0, 0, 0);
  return date;
}

function addDays(value: Date, days: number): Date {
  const date = normalizeMealDate(value);
  date.setDate(date.getDate() + days);
  return date;
}

function startOfWeek(value: Date): Date {
  const date = normalizeMealDate(value);
  const day = date.getDay();
  const offset = (day + 6) % 7;
  date.setDate(date.getDate() - offset);
  return date;
}

function endOfDay(value: Date): Date {
  const date = normalizeMealDate(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMealLabel(mealDate: Date, mealType: MealType): string {
  const dateLabel = mealDate.toLocaleDateString("en-GB", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${mealType.toLowerCase().replace("_", " ")} - ${dateLabel}`;
}

function mealExpenseMarker(mealId: string): string {
  return `MEAL:${mealId}`;
}

async function syncMealRoster(tx: Prisma.TransactionClient, meal: MealRow, activeMembers: Array<{ userId: string }>) {
  const activeMemberIds = new Set(activeMembers.map((member) => member.userId));
  const currentAttendance = meal.attendance;
  const currentMemberIds = new Set(currentAttendance.map((entry) => entry.userId));

  const missingAttendance = activeMembers
    .filter((member) => !currentMemberIds.has(member.userId))
    .map((member) => ({ mealId: meal.id, userId: member.userId, status: AttendanceStatus.ATTENDING }));

  const staleAttendanceIds = currentAttendance
    .filter((entry) => !activeMemberIds.has(entry.userId))
    .map((entry) => entry.id);

  if (missingAttendance.length > 0) {
    await tx.mealAttendance.createMany({ data: missingAttendance });
  }
  if (staleAttendanceIds.length > 0) {
    await tx.mealAttendance.deleteMany({ where: { id: { in: staleAttendanceIds } } });
  }
}

async function syncMealExpense(tx: Prisma.TransactionClient, mealId: string, actorId: string) {
  const meal = await tx.meal.findUnique({
    where: { id: mealId },
    include: {
      attendance: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  if (!meal) return;

  const existingExpense = await tx.expense.findFirst({
    where: { houseId: meal.houseId, description: mealExpenseMarker(meal.id) },
    select: { id: true },
  });

  const attendees = meal.attendance.filter((entry) => entry.status === AttendanceStatus.ATTENDING);
  const costPerHead = meal.costPerHead ? Number(meal.costPerHead) : null;

  if (costPerHead === null || attendees.length === 0) {
    if (existingExpense) {
      await tx.expenseShare.deleteMany({ where: { expenseId: existingExpense.id } });
      await tx.expense.delete({ where: { id: existingExpense.id } });
    }
    return;
  }

  const title = `${meal.mealType.toLowerCase().replace("_", " ")} meal - ${localDateKey(meal.mealDate)}`;
  const amount = new Prisma.Decimal((costPerHead * attendees.length).toFixed(2));

  const expense = existingExpense
    ? await tx.expense.update({
        where: { id: existingExpense.id },
        data: {
          title,
          amount,
          spentOn: meal.mealDate,
          category: "GROCERIES",
          splitMethod: "EQUAL",
        },
      })
    : await tx.expense.create({
        data: {
          houseId: meal.houseId,
          createdById: actorId,
          title,
          description: mealExpenseMarker(meal.id),
          amount,
          category: "GROCERIES",
          splitMethod: "EQUAL",
          spentOn: meal.mealDate,
        },
      });

  await tx.expenseShare.deleteMany({ where: { expenseId: expense.id } });
  await tx.expenseShare.createMany({
    data: attendees.map((entry) => ({
      expenseId: expense.id,
      userId: entry.userId,
      amount: new Prisma.Decimal(costPerHead),
      status: "PENDING",
    })),
  });
}

function mapMealRow(meal: MealRow, userId: string): MealAttendanceView {
  const myAttendance = meal.attendance.find((entry) => entry.userId === userId)?.status ?? AttendanceStatus.ATTENDING;
  const costPerHead = meal.costPerHead ? Number(meal.costPerHead) : null;
  const locked = meal.locksAt ? new Date(meal.locksAt).getTime() < Date.now() : false;

  return {
    id: meal.id,
    mealDate: meal.mealDate.toISOString(),
    mealType: meal.mealType,
    mealLabel: formatMealLabel(meal.mealDate, meal.mealType),
    menuProposalTitle: meal.menuProposal?.title ?? null,
    costPerHead,
    headcount: meal.headcount,
    locksAt: meal.locksAt ? meal.locksAt.toISOString() : null,
    locked,
    myAttendance,
    attendees: meal.attendance.map((entry) => ({
      id: entry.id,
      userId: entry.userId,
      name: entry.user.name,
      status: entry.status,
    })),
  };
}

async function ensureMealWindow(
  houseId: string,
  actorId: string,
  startDate: Date,
  days = DEFAULT_MEAL_WINDOW_DAYS
) {
  const windowStart = normalizeMealDate(startDate);
  const windowEnd = addDays(windowStart, days - 1);

  await prisma.$transaction(async (tx) => {
    const activeMembers = await tx.houseMember.findMany({
      where: { houseId, status: "ACTIVE" },
      select: { userId: true },
    });

    const approvedProposals = await tx.menuProposal.findMany({
      where: {
        houseId,
        status: "APPROVED",
        weekStartDate: { gte: startOfWeek(windowStart), lte: startOfWeek(windowEnd) },
      },
      select: { id: true, weekStartDate: true },
    });

    const proposalByWeek = new Map<string, string>();
    for (const proposal of approvedProposals) {
      proposalByWeek.set(localDateKey(normalizeMealDate(proposal.weekStartDate)), proposal.id);
    }

    for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
      const mealDate = addDays(windowStart, dayOffset);
      const weekKey = localDateKey(startOfWeek(mealDate));
      const menuProposalId = proposalByWeek.get(weekKey) ?? null;

      for (const mealType of MEAL_TYPES) {
        const existing = await tx.meal.findUnique({
          where: {
            houseId_mealDate_mealType: {
              houseId,
              mealDate,
              mealType,
            },
          },
          include: {
            attendance: { include: { user: { select: { id: true, name: true } } } },
            menuProposal: { select: { title: true } },
          },
        });

        if (!existing) {
          const created = await tx.meal.create({
            data: {
              houseId,
              mealDate,
              mealType,
              menuProposalId,
              locksAt: endOfDay(mealDate),
            },
            include: {
              attendance: { include: { user: { select: { id: true, name: true } } } },
              menuProposal: { select: { title: true } },
            },
          });

          await tx.mealAttendance.createMany({
            data: activeMembers.map((member) => ({
              mealId: created.id,
              userId: member.userId,
              status: AttendanceStatus.ATTENDING,
            })),
          });

          continue;
        }

        const nextData: Prisma.MealUncheckedUpdateInput = {};
        if (!existing.locksAt) {
          nextData.locksAt = endOfDay(mealDate);
        }
        if (!existing.menuProposalId && menuProposalId) {
          nextData.menuProposalId = menuProposalId;
        }
        if (Object.keys(nextData).length > 0) {
          await tx.meal.update({ where: { id: existing.id }, data: nextData });
        }

        await syncMealRoster(tx, existing, activeMembers);
        await syncMealExpense(tx, existing.id, actorId);
      }
    }
  });
}

async function createOrUpdateMealSlot(
  houseId: string,
  actorId: string,
  input: {
    mealDate: string;
    mealType: MealType;
    costPerHead?: number | null;
    locksAt?: string | null;
    menuProposalId?: string | null;
  }
) {
  const mealDate = normalizeMealDate(input.mealDate);
  const locksAt = input.locksAt ? new Date(input.locksAt) : endOfDay(mealDate);
  const costPerHead = input.costPerHead === undefined || input.costPerHead === null ? null : new Prisma.Decimal(input.costPerHead);

  return prisma.$transaction(async (tx) => {
    const meal = await tx.meal.upsert({
      where: {
        houseId_mealDate_mealType: {
          houseId,
          mealDate,
          mealType: input.mealType,
        },
      },
      create: {
        houseId,
        mealDate,
        mealType: input.mealType,
        costPerHead,
        locksAt,
        menuProposalId: input.menuProposalId ?? null,
      },
      update: {
        costPerHead,
        locksAt,
        menuProposalId: input.menuProposalId ?? null,
      },
      include: {
        attendance: { include: { user: { select: { id: true, name: true } } } },
        menuProposal: { select: { title: true } },
      },
    });

    const activeMembers = await tx.houseMember.findMany({
      where: { houseId, status: "ACTIVE" },
      select: { userId: true },
    });

    await syncMealRoster(tx, meal, activeMembers);
    await syncMealExpense(tx, meal.id, actorId);

    const refreshed = await tx.meal.findUnique({
      where: { id: meal.id },
      include: {
        attendance: { include: { user: { select: { id: true, name: true } } } },
        menuProposal: { select: { title: true } },
      },
    });

    if (!refreshed) {
      throw new Error("Meal disappeared after saving.");
    }

    return mapMealRow(refreshed, actorId);
  });
}

async function toggleMealAttendance(
  houseId: string,
  actorId: string,
  mealId: string,
  nextStatus?: AttendanceStatus
) {
  return prisma.$transaction(async (tx) => {
    const meal = await tx.meal.findUnique({
      where: { id: mealId },
      include: {
        attendance: { include: { user: { select: { id: true, name: true } } } },
        menuProposal: { select: { title: true } },
      },
    });

    if (!meal || meal.houseId !== houseId) {
      throw new Error("No such meal.");
    }
    if (meal.locksAt && meal.locksAt.getTime() <= Date.now()) {
      throw new Error("That meal is locked already.");
    }

    const current = meal.attendance.find((entry) => entry.userId === actorId)?.status ?? AttendanceStatus.ATTENDING;
    const desired = nextStatus ?? (current === AttendanceStatus.ATTENDING ? AttendanceStatus.SKIPPING : AttendanceStatus.ATTENDING);

    await tx.mealAttendance.upsert({
      where: {
        mealId_userId: {
          mealId,
          userId: actorId,
        },
      },
      create: {
        mealId,
        userId: actorId,
        status: desired,
      },
      update: {
        status: desired,
      },
    });

    await syncMealExpense(tx, meal.id, actorId);

    const refreshed = await tx.meal.findUnique({
      where: { id: meal.id },
      include: {
        attendance: { include: { user: { select: { id: true, name: true } } } },
        menuProposal: { select: { title: true } },
      },
    });

    if (!refreshed) {
      throw new Error("Meal disappeared after update.");
    }

    return mapMealRow(refreshed, actorId);
  });
}

export async function loadMealAttendancePageData(userId: string, houseId: string, from?: string | null): Promise<MealAttendancePageData> {
  const startDate = from ? normalizeMealDate(from) : normalizeMealDate(new Date());
  await ensureMealWindow(houseId, userId, startDate, DEFAULT_MEAL_WINDOW_DAYS);

  const [house, meals, canManageMeals] = await Promise.all([
    prisma.house.findUnique({ where: { id: houseId }, select: { id: true, name: true } }),
    prisma.meal.findMany({
      where: {
        houseId,
        mealDate: {
          gte: startDate,
          lt: addDays(startDate, DEFAULT_MEAL_WINDOW_DAYS),
        },
      },
      include: {
        attendance: { include: { user: { select: { id: true, name: true } } } },
        menuProposal: { select: { title: true } },
      },
      orderBy: [{ mealDate: "asc" }, { mealType: "asc" }],
    }),
    isHouseAdmin(userId, houseId),
  ]);

  if (!house) {
    throw new Error("No such house.");
  }

  return {
    house,
    canManageMeals,
    meals: meals.map((meal) => mapMealRow(meal, userId)),
  };
}

export async function saveMealSlot(
  userId: string,
  houseId: string,
  input: { mealDate: string; mealType: MealType; costPerHead?: number | null; locksAt?: string | null; menuProposalId?: string | null }
) {
  return createOrUpdateMealSlot(houseId, userId, input);
}

export async function changeMealAttendance(
  userId: string,
  houseId: string,
  mealId: string,
  status?: AttendanceStatus
) {
  return toggleMealAttendance(houseId, userId, mealId, status);
}
