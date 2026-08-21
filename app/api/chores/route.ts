import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { assertCanManageHouse, isHouseAdmin } from "@/lib/authz";
import { computeNextDueDate, sweepMissedChores, todayUtcMidnight } from "@/lib/chores";
import { GOOGLE_SCOPES } from "@/lib/google";
import { prisma } from "@/lib/prisma";
import type { ChoreFrequency } from "@prisma/client";

/**
 * M3.4 Automated Chore Rotation — Mahia Tanzin.
 *
 * Per-assignment actions (complete, reschedule, split, rate) live under
 * app/api/chores/assignments/[assignmentId]/*, not here — this route is
 * chore-list-level only (list + create). See app/api/chores/[choreId]/
 * route.ts for admin edits to an existing chore.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before setting up chores.");

  // Lazy sweep, same pattern as lib/joinRequests.ts's 14-day expiry — nothing
  // a resident sees depends on this having run recently.
  await sweepMissedChores(houseId);

  const [house, chores] = await Promise.all([
    prisma.house.findUnique({ where: { id: houseId }, select: { choreQualityRatingEnabled: true } }),
    prisma.chore.findMany({
      where: { houseId, isActive: true },
      include: {
        assignments: {
          orderBy: { dueDate: "desc" },
          take: 8,
          include: {
            user: { select: { id: true, name: true } },
            subtasks: { include: { user: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const assignmentIds = chores.flatMap((c) => c.assignments.map((a) => a.id));
  const ratingAggregates = assignmentIds.length
    ? await prisma.choreQualityRating.groupBy({
        by: ["assignmentId"],
        where: { assignmentId: { in: assignmentIds } },
        _avg: { score: true },
        _count: { score: true },
      })
    : [];
  // Aggregate only — never the raters' identities (ratings are anonymous).
  const ratingByAssignment = new Map(
    ratingAggregates.map((r) => [r.assignmentId, { avg: r._avg.score, count: r._count.score }])
  );

  const choresOut = chores.map((chore) => ({
    ...chore,
    assignments: chore.assignments.map((a) => ({
      ...a,
      rating: ratingByAssignment.get(a.id) ?? null,
    })),
  }));

  const admin = await isHouseAdmin(user.id, houseId);
  let adminInfo: {
    neverConnectedGoogleTasks: { id: string; name: string | null }[];
    needsGoogleReconnect: { id: string; name: string | null }[];
    coverageGaps: string[];
  } | null = null;

  if (admin) {
    const rotationUserIds = Array.from(new Set(chores.flatMap((c) => c.rotationOrder)));
    const [credentials, members] = await Promise.all([
      prisma.googleCredential.findMany({
        where: { userId: { in: rotationUserIds } },
        select: { userId: true, scopes: true, needsReconnectAt: true },
      }),
      prisma.user.findMany({ where: { id: { in: rotationUserIds } }, select: { id: true, name: true } }),
    ]);
    const credByUser = new Map(credentials.map((c) => [c.userId, c]));
    const nameById = new Map(members.map((m) => [m.id, m.name]));

    const neverConnectedGoogleTasks: { id: string; name: string | null }[] = [];
    const needsGoogleReconnect: { id: string; name: string | null }[] = [];
    for (const id of rotationUserIds) {
      const cred = credByUser.get(id);
      if (!cred || !cred.scopes.includes(GOOGLE_SCOPES.tasks)) {
        neverConnectedGoogleTasks.push({ id, name: nameById.get(id) ?? null });
      } else if (cred.needsReconnectAt) {
        needsGoogleReconnect.push({ id, name: nameById.get(id) ?? null });
      }
    }

    const today = todayUtcMidnight();
    const coverageGaps = chores
      .filter((chore) => {
        const lastAssignment = chore.assignments[0]; // ordered dueDate desc
        const expectedDue = computeNextDueDate(chore, lastAssignment?.dueDate ?? null);
        const alreadyHasIt = lastAssignment && lastAssignment.dueDate.getTime() === expectedDue.getTime();
        return expectedDue.getTime() < today.getTime() && !alreadyHasIt;
      })
      .map((chore) => chore.name);

    adminInfo = { neverConnectedGoogleTasks, needsGoogleReconnect, coverageGaps };
  }

  const houseMembers = await prisma.houseMember.findMany({
    where: { houseId, status: "ACTIVE" },
    select: { user: { select: { id: true, name: true } } },
    orderBy: { joinedAt: "asc" },
  });

  return ok({
    chores: choresOut,
    choreQualityRatingEnabled: house?.choreQualityRatingEnabled ?? false,
    isAdmin: admin,
    admin: adminInfo,
    houseMembers: houseMembers.map((m) => m.user),
  });
});

const CHORE_FREQUENCIES: ChoreFrequency[] = ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"];

export const POST = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before setting up chores.");
  await assertCanManageHouse(user, houseId);

  const body = await readJson<{
    name: string;
    description?: string;
    frequency: ChoreFrequency;
    rotationOrder?: string[];
  }>(req);
  if (!body?.name?.trim()) return badRequest("name is required");
  if (!body.frequency || !CHORE_FREQUENCIES.includes(body.frequency)) {
    return badRequest(`frequency must be one of: ${CHORE_FREQUENCIES.join(", ")}`);
  }

  let rotationOrder = body.rotationOrder;
  if (!rotationOrder || rotationOrder.length === 0) {
    const members = await prisma.houseMember.findMany({
      where: { houseId, status: "ACTIVE" },
      orderBy: { joinedAt: "asc" },
      select: { userId: true },
    });
    rotationOrder = members.map((m) => m.userId);
  } else {
    // Reject ids that aren't actually active members of this house — the
    // rotation cron treats a stale id as a coverage-affecting skip, not a
    // creation-time error, so it's worth catching here instead.
    const validIds = new Set(
      (
        await prisma.houseMember.findMany({
          where: { houseId, userId: { in: rotationOrder }, status: "ACTIVE" },
          select: { userId: true },
        })
      ).map((m) => m.userId)
    );
    const invalid = rotationOrder.filter((id) => !validIds.has(id));
    if (invalid.length > 0) return badRequest("rotationOrder includes someone who isn't an active member of this house.");
  }

  if (rotationOrder.length === 0) {
    return badRequest("This house has no active members to rotate the chore through.");
  }

  const chore = await prisma.chore.create({
    data: {
      houseId,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      frequency: body.frequency,
      rotationOrder,
    },
  });

  return ok(chore, 201);
});
