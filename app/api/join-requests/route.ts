import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { assertCanSetJoinRequestStatus, joinRequestVisibilityFilter } from "@/lib/authz";
import { admitToHouse } from "@/lib/houses";
import { expireStalePending } from "@/lib/joinRequests";
import { prisma } from "@/lib/prisma";
import type { JoinRequestStatus } from "@prisma/client";

/**
 * M1.2 — formal join requests, Join Request Lifecycle & Concurrency
 * Guardrail (Mahia Tanzin).
 *
 * Two-sided: the applicant sees their own, the landlord sees requests against
 * their listings. That used to be an RLS policy; it's now the visibility
 * filter from lib/authz.ts, and forgetting it would expose every application
 * on the platform.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  await expireStalePending(prisma.joinRequest);

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

/** Thrown inside the accept transaction when the room filled before this request could be honored. */
class RoomFullError extends Error {}

/** Applicant withdraws; landlord accepts or rejects. */
export const PATCH = withUser(async (user, req: Request) => {
  const body = await readJson<{ id: string; status: JoinRequestStatus }>(req);
  if (!body?.id || !body?.status) return badRequest("id and status are required");
  if (body.status === "PENDING") return badRequest("Can't move a request back to pending.");
  if (body.status === "EXPIRED") return badRequest("EXPIRED is set automatically, not by request.");

  await expireStalePending(prisma.joinRequest);
  const existing = await assertCanSetJoinRequestStatus(user, body.id, body.status);

  // Common Workflow 2 — "automated role switching based on house join
  // requests". Accepting is what actually moves someone into a house, so both
  // writes go in one transaction: a failure can't leave a request marked
  // ACCEPTED against a house the applicant never got into.
  //
  // Atomic Room Allocation: capacity is re-checked INSIDE the transaction
  // (not before it) so two concurrent accepts on the last open seat can't
  // both succeed. Whichever gets there first fills the room; every other
  // still-PENDING request for that same listing is auto-cancelled in the
  // same transaction, with a graceful failure for whoever loses the race.
  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (body.status === "ACCEPTED") {
        if (!existing.listing.houseId) {
          throw new Error("That listing isn't attached to a house yet.");
        }

        // Serialize concurrent accepts on the same room. Without this, two
        // overlapping transactions each cancel-and-lock the OTHER'S
        // join-request row before locking their own (count -> admit -> cancel
        // siblings -> update self), which can form a real lock cycle and
        // surface as a raw Postgres deadlock instead of a graceful "room
        // full" response. Locking the listing row first forces the second
        // transaction to wait for the first to fully commit, so it re-reads
        // an accurate seat count instead of racing it.
        await tx.$queryRaw`SELECT id FROM "listings" WHERE id = ${existing.listing.id} FOR UPDATE`;

        const occupiedSeats = await tx.joinRequest.count({
          where: { listingId: existing.listing.id, status: "ACCEPTED" },
        });
        if (occupiedSeats >= existing.listing.capacity) {
          throw new RoomFullError("This room is already full.");
        }

        await admitToHouse(tx, existing.listing.houseId, existing.userId, "RESIDENT");

        // Auto-Cancel duplicate pending requests, but only once this
        // acceptance actually fills the room. A multi-seat listing
        // (SHARED/SEAT/ENTIRE_FLAT) should keep taking applicants for its
        // remaining seats, not cancel every other applicant the moment the
        // first one is accepted.
        if (occupiedSeats + 1 >= existing.listing.capacity) {
          await tx.joinRequest.updateMany({
            where: { listingId: existing.listing.id, status: "PENDING", id: { not: body.id } },
            data: { status: "CANCELLED" },
          });
        }
      }

      return tx.joinRequest.update({ where: { id: body.id }, data: { status: body.status } });
    });

    return ok(updated);
  } catch (err) {
    if (err instanceof RoomFullError) return badRequest(err.message);
    throw err;
  }
});
