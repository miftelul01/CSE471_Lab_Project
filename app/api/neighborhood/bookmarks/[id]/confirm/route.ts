import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { loadVisibleBookmark } from "@/lib/authz";
import { REPORT_COOLDOWN_HOURS, RESTORE_WINDOW_DAYS, goneThreshold } from "@/lib/neighborhood";
import { activeResidentCount, softDeleteBookmark } from "@/lib/neighborhood.server";
import { prisma } from "@/lib/prisma";
import type { Verdict } from "@prisma/client";

type Params = { params: { id: string } };

/**
 * M2.4 — freshness. "Is this shop still there?"
 *
 * ── WHY THIS ENDPOINT IS THE POINT OF THE FEATURE ───────────────────────────
 * A neighbourhood map that nobody maintains is worse than no map, because it
 * looks authoritative while quietly rotting. Shops here close, move one lane
 * over, or turn into a phone repair counter. So every resident can vouch for an
 * entry or report it gone, and every entry carries how recently that happened.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const dynamic = "force-dynamic";

export const POST = withUser(async (user, req: Request, { params }: Params) => {
  const bookmark = await loadVisibleBookmark(user, params.id);
  if (bookmark.deletedAt) return badRequest("That place has already been removed from the map.");

  const body = await readJson<{ verdict?: Verdict }>(req);
  const verdict = body?.verdict;
  if (verdict !== "STILL_THERE" && verdict !== "GONE") {
    return badRequest("verdict must be STILL_THERE or GONE.");
  }

  // Rate limit, read off the log rather than kept in a counter: one verdict per
  // resident per place per day. Without it, one person clicking "gone" twice
  // reaches the two-resident threshold on their own.
  const cooldownStart = new Date(Date.now() - REPORT_COOLDOWN_HOURS * 60 * 60 * 1000);
  const recent = await prisma.confirmation.findFirst({
    where: { bookmarkId: bookmark.id, residentId: user.id, createdAt: { gte: cooldownStart } },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    return badRequest(
      `You already reported on this place in the last ${REPORT_COOLDOWN_HOURS} hours. Try again tomorrow.`
    );
  }

  await prisma.confirmation.create({
    data: { bookmarkId: bookmark.id, residentId: user.id, verdict },
  });

  if (verdict === "STILL_THERE") {
    await prisma.bookmark.update({
      where: { id: bookmark.id },
      data: { lastConfirmedAt: new Date() },
    });
    return ok({ verdict, removed: false });
  }

  // ── GONE ──────────────────────────────────────────────────────────────────
  // Count residents by their MOST RECENT verdict, not by every GONE ever
  // filed. Somebody who reported a shop closed for Ramadan and confirmed it
  // open again a month later should not still be counted as one of the two
  // voices removing it.
  const history = await prisma.confirmation.findMany({
    where: { bookmarkId: bookmark.id },
    select: { residentId: true, verdict: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const latestByResident = new Map<string, Verdict>();
  for (const row of history) {
    if (!latestByResident.has(row.residentId)) latestByResident.set(row.residentId, row.verdict);
  }
  const goneVoices = [...latestByResident.values()].filter((v) => v === "GONE").length;

  const residents = await activeResidentCount(bookmark.houseId);
  const threshold = goneThreshold(residents);

  if (goneVoices < threshold) {
    return ok({
      verdict,
      removed: false,
      goneVoices,
      threshold,
      message: `Noted. ${threshold - goneVoices} more resident${
        threshold - goneVoices === 1 ? "" : "s"
      } need to agree before it comes off the map.`,
    });
  }

  await softDeleteBookmark(bookmark.id);

  // The house is told about this the moment it happens rather than in the
  // nightly digest, because it is destructive and only reversible for 30 days.
  // With no notification transport in this codebase yet, "telling the house"
  // means the entry surfaces in the Recently removed panel that every resident
  // sees on the map — which is also where the admin restores it from.
  return ok({
    verdict,
    removed: true,
    goneVoices,
    threshold,
    message: `Removed from the house map. Your house admin can restore it for the next ${RESTORE_WINDOW_DAYS} days.`,
  });
});
