import { badRequest, notImplemented, ok, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { TicketStatus } from "@prisma/client";

/** M3.1 Maintenance Ticket System — Miftelul Mehebub. */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before reporting maintenance issues.");

  const status = new URL(req.url).searchParams.get("status") as TicketStatus | null;

  const tickets = await prisma.maintenanceTicket.findMany({
    where: { houseId, ...(status ? { status } : {}) },
    include: {
      events: { orderBy: { createdAt: "asc" } },
      reportedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return ok({ tickets });
});

/**
 * TODO (M3.1): create a ticket with reportedById: user.id and houseId from
 * getActiveHouseId, after assertHouseMember(). Status defaults to OPEN.
 *
 * NOTE: the history row is no longer written by a database trigger. The
 * trigger used auth.uid() to record who acted, which Prisma can't provide, so
 * create the MaintenanceTicketEvent yourself inside the same
 * prisma.$transaction as the ticket change — that keeps it atomic AND records
 * a real actor. resolvedAt is still stamped by a trigger.
 */
export const POST = withUser(async () => notImplemented("Reporting a maintenance ticket"));

/** TODO (M3.1): update status/assignee, writing a MaintenanceTicketEvent too. */
export const PATCH = withUser(async () => notImplemented("Updating a ticket"));
