import { NextResponse } from "next/server";

import { ok } from "@/lib/api";
import {
  DAY_MS,
  LIVE_DEAL_STATUSES,
  PRIVATE_PURGE_AFTER_DAYS,
  deriveDealStatus,
} from "@/lib/neighborhood";
import { prisma } from "@/lib/prisma";

/**
 * M2.4 nightly housekeeping. Runs at 18:00 UTC — midnight in Asia/Dhaka.
 *
 * ── WHAT THIS JOB IS AND IS NOT ─────────────────────────────────────────────
 * It is NOT what decides a deal's status. Every screen derives that from
 * timestamps when it renders, so if this job never runs again, nothing a
 * resident sees becomes wrong. What it does is write the same answer into
 * `deals.cached_status` so the status can be filtered and indexed in SQL, sweep
 * caches, and honour the 14-day purge a departing resident agreed to.
 *
 * That distinction is the whole reason the job is allowed to be unreliable, and
 * cron on a free plan is unreliable.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const dynamic = "force-dynamic";

/** Vercel sends this on scheduled invocations. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Without a secret configured the endpoint would be an open button anyone
    // could press. In development that is convenient; in production it is a
    // stranger purging bookmarks.
    return process.env.NODE_ENV !== "production";
  }
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const now = new Date();

  /* ── 1. Refresh the filterable copy of each deal's status ──────────────── */

  const deals = await prisma.deal.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      cachedStatus: true,
      validFrom: true,
      validUntil: true,
      lastConfirmedAt: true,
      retiredAt: true,
      createdAt: true,
    },
  });

  // Only rows whose answer actually changed are written. On a normal night that
  // is a handful out of hundreds.
  const changed = deals
    .map((deal) => ({ id: deal.id, status: deriveDealStatus(deal, now), was: deal.cachedStatus }))
    .filter((row) => row.status !== row.was);

  for (const row of changed) {
    await prisma.deal.update({ where: { id: row.id }, data: { cachedStatus: row.status } });
  }

  /* ── 2. Purge a departed resident's private bookmarks ──────────────────── */
  //
  // HOUSE bookmarks are untouched by this — they belong to the household and
  // are the reason someone joining inherits a working map. Only PRIVATE ones
  // go, and only 14 days after the person left, which is the window they were
  // given to promote them to the house instead.

  const purgeBefore = new Date(now.getTime() - PRIVATE_PURGE_AFTER_DAYS * DAY_MS);
  const departed = await prisma.houseMember.findMany({
    where: { status: "LEFT", leftAt: { not: null, lte: purgeBefore } },
    select: { houseId: true, userId: true },
  });

  let purged = 0;
  for (const membership of departed) {
    const result = await prisma.bookmark.updateMany({
      where: {
        houseId: membership.houseId,
        addedById: membership.userId,
        visibility: "PRIVATE",
        deletedAt: null,
      },
      data: { deletedAt: now },
    });
    purged += result.count;
  }

  /* ── 3. Sweep the provider caches ──────────────────────────────────────── */

  const [cacheSwept, callsSwept] = await Promise.all([
    prisma.mapApiCache.deleteMany({ where: { expiresAt: { lt: now } } }),
    // The rate limiter only ever looks back one hour; a day of history is
    // plenty of margin for auditing a complaint about being throttled.
    prisma.mapApiCall.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - DAY_MS) } } }),
  ]);

  /* ── 4. Build the daily deal digest ────────────────────────────────────── */
  //
  // Deals are batched into ONE digest per resident per day rather than pushed
  // as they are posted. A house of six with an enthusiastic bargain-hunter
  // would otherwise generate a dozen interruptions a day, and the first thing
  // anybody does with that is turn notifications off entirely.
  //
  // There is no notification transport in this codebase yet (no email sender,
  // no push, no in-app inbox), so this assembles the payload and logs it. When
  // a transport lands, this is the one place that has to change — the batching
  // decision above is already made.

  const since = new Date(now.getTime() - DAY_MS);
  const freshDeals = await prisma.deal.findMany({
    where: { createdAt: { gte: since }, deletedAt: null },
    select: {
      id: true,
      title: true,
      validFrom: true,
      validUntil: true,
      lastConfirmedAt: true,
      retiredAt: true,
      createdAt: true,
      bookmark: { select: { houseId: true, name: true, visibility: true, addedById: true } },
    },
  });

  const byHouse = new Map<string, { dealId: string; title: string; place: string }[]>();
  for (const deal of freshDeals) {
    // A deal on somebody's private pin is nobody else's news.
    if (deal.bookmark.visibility !== "HOUSE") continue;
    if (!LIVE_DEAL_STATUSES.includes(deriveDealStatus(deal, now))) continue;

    const list = byHouse.get(deal.bookmark.houseId) ?? [];
    list.push({ dealId: deal.id, title: deal.title, place: deal.bookmark.name });
    byHouse.set(deal.bookmark.houseId, list);
  }

  let digests = 0;
  for (const [houseId, items] of byHouse) {
    const residents = await prisma.houseMember.count({ where: { houseId, status: "ACTIVE" } });
    digests += residents;
    console.info(
      `[m2.4 digest] house ${houseId}: ${items.length} new deal(s) for ${residents} resident(s) —`,
      items.map((item) => `${item.title} @ ${item.place}`).join("; ")
    );
  }

  return ok({
    ranAt: now.toISOString(),
    dealStatusesRewritten: changed.length,
    privateBookmarksPurged: purged,
    cacheRowsSwept: cacheSwept.count,
    callRowsSwept: callsSwept.count,
    digestsQueued: digests,
  });
}
