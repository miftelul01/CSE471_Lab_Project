import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { assertCanSetJoinRequestStatus, joinRequestVisibilityFilter } from "@/lib/authz";
import { admitToHouse } from "@/lib/houses";
import { prisma } from "@/lib/prisma";
import type { JoinRequestStatus } from "@prisma/client";

/**
 * M1.2 — formal join requests (Mahia Tanzin).
 *
 * Two-sided: the applicant sees their own, the landlord sees requests against
 * their listings. That used to be an RLS policy; it's now the visibility
 * filter from lib/authz.ts, and forgetting it would expose every application
 * on the platform.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const requests = await prisma.joinRequest.findMany({
    where: joinRequestVisibilityFilter(user),
    include: { listing: true, user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return ok({ requests });
});

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<{ listing_id: string; message?: string }>(req);
  if (!body?.listing_id) return badRequest("listing_id is required");

  // The partial unique index allows only one PENDING request per listing, so a
  // duplicate raises P2002, which withUser turns into a 400.
  const request = await prisma.joinRequest.create({
    data: {
      userId: user.id,
      listingId: body.listing_id,
      message: body.message || null,
      status: "PENDING",
    },
  });
  return ok(request, 201);
});

/** Applicant withdraws; landlord accepts or rejects. */
export const PATCH = withUser(async (user, req: Request) => {
  const body = await readJson<{ id: string; status: JoinRequestStatus }>(req);
  if (!body?.id || !body?.status) return badRequest("id and status are required");
  if (body.status === "PENDING") return badRequest("Can't move a request back to pending.");

  const existing = await assertCanSetJoinRequestStatus(user, body.id, body.status);

  // Common Workflow 2 — "automated role switching based on house join
  // requests". Accepting is what actually moves someone into a house, so both
  // writes go in one transaction: a failure can't leave a request marked
  // ACCEPTED against a house the applicant never got into.
  const updated = await prisma.$transaction(async (tx) => {
    if (body.status === "ACCEPTED") {
      if (!existing.listing.houseId) {
        throw new Error("That listing isn't attached to a house yet.");
      }
      await admitToHouse(tx, existing.listing.houseId, existing.userId, "RESIDENT");
    }

    return tx.joinRequest.update({ where: { id: body.id }, data: { status: body.status } });
  });

  return ok(updated);
});
