import { badRequest, notFound, ok, readJson, withUser } from "@/lib/api";
import { bookmarkVisibilityFilter, requireActiveHouseId } from "@/lib/authz";
import { REPORT_COOLDOWN_HOURS, goneThreshold } from "@/lib/neighborhood";
import { activeResidentCount } from "@/lib/neighborhood.server";
import { prisma } from "@/lib/prisma";
import type { Verdict } from "@prisma/client";

type Params = { params: { id: string } };

/**
 * M2.4 — "did they actually honour it?"
 *
 * The same freshness idea as a bookmark, applied to an offer. A discount the
 * shopkeeper has quietly stopped giving is the fastest way for the house to
 * lose faith in this whole layer, so reporting one takes two clicks and
 * enough agreement retires it.
 */

export const dynamic = "force-dynamic";

export const POST = withUser(async (user, req: Request, { params }: Params) => {
  const houseId = await requireActiveHouseId(user);

  // Scoped through the bookmark, which is what ties the deal to this house.
  const deal = await prisma.deal.findFirst({
    where: {
      id: params.id,
      deletedAt: null,
      bookmark: { ...bookmarkVisibilityFilter(user, houseId), deletedAt: null },
    },
    select: { id: true, retiredAt: true },
  });
  if (!deal) return notFound("No such deal");

  const body = await readJson<{ verdict?: Verdict }>(req);
  const verdict = body?.verdict;
  if (verdict !== "STILL_THERE" && verdict !== "GONE") {
    return badRequest("verdict must be STILL_THERE or GONE.");
  }

  const cooldownStart = new Date(Date.now() - REPORT_COOLDOWN_HOURS * 60 * 60 * 1000);
  const recent = await prisma.dealReport.findFirst({
    where: { dealId: deal.id, reportedById: user.id, createdAt: { gte: cooldownStart } },
    select: { id: true },
  });
  if (recent) {
    return badRequest(
      `You already reported on this deal in the last ${REPORT_COOLDOWN_HOURS} hours. Try again tomorrow.`
    );
  }

  await prisma.dealReport.create({
    data: { dealId: deal.id, reportedById: user.id, verdict },
  });

  if (verdict === "STILL_THERE") {
    // Resets the 60-day decay clock an open-ended deal runs on, and clears the
    // "still honoured?" prompt for another 30 days.
    await prisma.deal.update({ where: { id: deal.id }, data: { lastConfirmedAt: new Date() } });
    return ok({ verdict, retired: false });
  }

  const reports = await prisma.dealReport.findMany({
    where: { dealId: deal.id },
    select: { reportedById: true, verdict: true },
    orderBy: { createdAt: "desc" },
  });

  const latestByResident = new Map<string, Verdict>();
  for (const row of reports) {
    if (!latestByResident.has(row.reportedById)) latestByResident.set(row.reportedById, row.verdict);
  }
  const goneVoices = [...latestByResident.values()].filter((v) => v === "GONE").length;

  const threshold = goneThreshold(await activeResidentCount(houseId));
  if (goneVoices < threshold || deal.retiredAt) {
    return ok({ verdict, retired: false, goneVoices, threshold });
  }

  // Retired, not deleted: the shop is still there, the offer is not. Its
  // history stays on the bookmark so the house can see the pattern if the same
  // shop keeps advertising deals it does not honour.
  await prisma.deal.update({
    where: { id: deal.id },
    data: { retiredAt: new Date(), cachedStatus: "RETIRED" },
  });

  return ok({
    verdict,
    retired: true,
    goneVoices,
    threshold,
    message: "Marked as no longer honoured.",
  });
});
