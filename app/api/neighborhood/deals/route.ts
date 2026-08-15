import { badRequest, missingFields, ok, readJson, withUser } from "@/lib/api";
import { loadVisibleBookmark, requireActiveHouseId } from "@/lib/authz";
import {
  MAX_DEAL_TEXT_LENGTH,
  MAX_DEAL_TITLE_LENGTH,
  deriveDealStatus,
} from "@/lib/neighborhood";
import { listDeals } from "@/lib/neighborhood.server";
import { prisma } from "@/lib/prisma";

/**
 * M2.4 — the deals layer.
 *
 * Deliberately a separate table from the places it hangs off. A shop is a
 * durable fact about the neighbourhood; "20% off until Friday" is an event with
 * a lifecycle of its own. One table for both would force a choice between
 * expiring the shop with the offer and leaving dead discounts on the map.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: Request) => {
  const houseId = await requireActiveHouseId(user);
  const url = new URL(req.url);

  const deals = await listDeals(user, houseId, {
    bookmarkId: url.searchParams.get("bookmarkId") ?? undefined,
    includeArchived: url.searchParams.get("includeArchived") === "true",
  });

  return ok({ deals });
});

type CreateBody = {
  bookmarkId?: string;
  title?: string;
  description?: string | null;
  discountNote?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
};

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<CreateBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["bookmarkId", "title"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  // Resolves through the session's house, so a deal cannot be attached to a
  // place in somebody else's flat or to another resident's private pin.
  const bookmark = await loadVisibleBookmark(user, String(body.bookmarkId));
  if (bookmark.deletedAt) return badRequest("That place has been removed from the map.");

  const title = String(body.title).trim();
  if (!title) return badRequest("Give the deal a title.");
  if (title.length > MAX_DEAL_TITLE_LENGTH) {
    return badRequest(`Title must be ${MAX_DEAL_TITLE_LENGTH} characters or fewer.`);
  }

  const description = body.description?.toString().trim() || null;
  const discountNote = body.discountNote?.toString().trim() || null;
  for (const [label, value] of [
    ["Description", description],
    ["Discount note", discountNote],
  ] as const) {
    if (value && value.length > MAX_DEAL_TEXT_LENGTH) {
      return badRequest(`${label} must be ${MAX_DEAL_TEXT_LENGTH} characters or fewer.`);
    }
  }

  const validFrom = body.validFrom ? new Date(body.validFrom) : new Date();
  if (Number.isNaN(validFrom.getTime())) return badRequest("validFrom is not a valid date.");

  // Null is a real answer here, not a missing one: a standing "10% for
  // regulars" arrangement has no end date, and those decay on the age of their
  // last confirmation instead of on a clock.
  let validUntil: Date | null = null;
  if (body.validUntil) {
    validUntil = new Date(body.validUntil);
    if (Number.isNaN(validUntil.getTime())) return badRequest("validUntil is not a valid date.");
    if (validUntil <= validFrom) return badRequest("The deal must end after it starts.");
  }

  const deal = await prisma.deal.create({
    data: {
      bookmarkId: bookmark.id,
      title,
      description,
      discountNote,
      validFrom,
      validUntil,
      postedById: user.id,
      postedByName: user.profile.name || user.email,
      // Seeded with what the derivation would say right now. It is only ever a
      // filterable copy — nothing displays it.
      cachedStatus: deriveDealStatus({
        validFrom,
        validUntil,
        lastConfirmedAt: null,
        retiredAt: null,
        createdAt: new Date(),
      }),
    },
    select: { id: true, title: true },
  });

  return ok({ deal }, 201);
});
