import { badRequest, missingFields, ok, readJson, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import {
  assertCanEditTicketDetails,
  assertCanSetTicketStatus,
  assertHouseMember,
} from "@/lib/authz";
import {
  MAX_TICKET_NOTE,
  TICKET_INCLUDE,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  canTransition,
  isTicketEditable,
  toTicketView,
  validateTicketInput,
} from "@/lib/maintenance";
import { prisma } from "@/lib/prisma";
import type { TicketStatus } from "@prisma/client";

/**
 * M3.1 Maintenance Ticket System — Miftelul Mehebub.
 *
 * "Residents report property issues, the landlord updates the status, and a
 * full history log is maintained per house."
 *
 * The history is written here, not by a trigger. The original trigger used
 * auth.uid() to record who acted; Prisma connects as one database user and
 * cannot supply that, so every status change writes its own
 * MaintenanceTicketEvent inside the same transaction as the update. Atomic, and
 * with a real actor against it.
 *
 * `resolvedAt` is the exception and is still stamped by the
 * maintenance_tickets_sync_resolved_at trigger, so it stays honest no matter
 * which path flips the row. Nothing here sets it.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before reporting maintenance issues.");
  await assertHouseMember(user, houseId);

  const status = new URL(req.url).searchParams.get("status") as TicketStatus | null;
  if (status && !TICKET_STATUSES.includes(status)) {
    return badRequest(`status must be one of: ${TICKET_STATUSES.join(", ")}.`);
  }

  const tickets = await prisma.maintenanceTicket.findMany({
    where: { houseId, ...(status ? { status } : {}) },
    include: TICKET_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  return ok({ tickets: tickets.map(toTicketView) });
});

type ReportBody = {
  title?: string;
  description?: string;
  category?: string | null;
  priority?: string;
  photoUrl?: string | null;
};

/**
 * Report a problem. Any resident of the house may — the brief has residents at
 * large doing this, not just the flat admin.
 *
 * The opening history row is written here too, so a ticket's timeline starts at
 * "reported" rather than appearing to spring into existence at the landlord's
 * first action.
 */
export const POST = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before reporting maintenance issues.");
  await assertHouseMember(user, houseId);

  const body = await readJson<ReportBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const valid = validateTicketInput(body);
  if ("error" in valid) return badRequest(valid.error);

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.maintenanceTicket.create({
      data: {
        houseId,
        reportedById: user.id,
        title: valid.title,
        description: valid.description,
        category: valid.category,
        priority: valid.priority,
        photoUrl: valid.photoUrl,
      },
      select: { id: true },
    });

    await tx.maintenanceTicketEvent.create({
      data: {
        ticketId: created.id,
        actorId: user.id,
        fromStatus: null,
        toStatus: "OPEN",
        note: "Reported",
      },
    });

    return tx.maintenanceTicket.findUniqueOrThrow({
      where: { id: created.id },
      include: TICKET_INCLUDE,
    });
  });

  return ok({ ticket: toTicketView(ticket) }, 201);
});

type EditBody = {
  ticketId?: string;
  title?: string;
  description?: string;
  category?: string | null;
  priority?: string;
  photoUrl?: string | null;
};

/**
 * Correct the ticket's own text — the reporter's half of the split the brief
 * describes, where the resident owns the description and the landlord owns the
 * status.
 *
 * Separate verb from PATCH on purpose: PATCH moves the state machine and is
 * restricted to the house admin, while this is the reporter fixing "leaking
 * tap" to "leaking tap, now flooding". Folding both into one handler would mean
 * one permission check guarding two very different powers.
 *
 * Only while the ticket is still OPEN. Once the house has acted, rewriting the
 * report would leave the timeline showing a landlord responding to words that
 * are no longer there.
 */
export const PUT = withUser(async (user, req: Request) => {
  const body = await readJson<EditBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["ticketId"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  const ticketId = String(body.ticketId);
  const existing = await assertCanEditTicketDetails(user, ticketId);

  if (!isTicketEditable(existing.status)) {
    return badRequest(
      `This ticket is already ${TICKET_STATUS_LABELS[existing.status].toLowerCase()}, so its ` +
        `description can no longer be changed.`
    );
  }

  const valid = validateTicketInput(body);
  if ("error" in valid) return badRequest(valid.error);

  const ticket = await prisma.maintenanceTicket.update({
    where: { id: ticketId },
    data: {
      title: valid.title,
      description: valid.description,
      category: valid.category,
      priority: valid.priority,
      photoUrl: valid.photoUrl,
    },
    include: TICKET_INCLUDE,
  });

  return ok({ ticket: toTicketView(ticket) });
});

type UpdateBody = {
  ticketId?: string;
  status?: string;
  assignedToId?: string | null;
  note?: string;
};

/**
 * Drive a ticket's status, and optionally assign it to someone.
 *
 * Two guards that look redundant but are not: assertCanSetTicketStatus decides
 * whether this caller may move ANY ticket in that house, and canTransition
 * decides whether THIS move is legal from where the ticket currently is. The
 * first is about the person, the second about the state machine, and dropping
 * either leaves a hole the other does not cover.
 */
export const PATCH = withUser(async (user, req: Request) => {
  const body = await readJson<UpdateBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["ticketId"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  const ticketId = String(body.ticketId);
  const existing = await assertCanSetTicketStatus(user, ticketId);

  const wantsStatus = body.status !== undefined;
  const wantsAssignee = body.assignedToId !== undefined;
  if (!wantsStatus && !wantsAssignee) {
    return badRequest("Send a status, an assignedToId, or both.");
  }

  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > MAX_TICKET_NOTE) {
    return badRequest(`Note must be ${MAX_TICKET_NOTE} characters or fewer.`);
  }

  let nextStatus = existing.status;
  if (wantsStatus) {
    const status = body.status as TicketStatus;
    if (!TICKET_STATUSES.includes(status)) {
      return badRequest(`status must be one of: ${TICKET_STATUSES.join(", ")}.`);
    }
    if (status === existing.status) {
      return badRequest(`This ticket is already ${TICKET_STATUS_LABELS[status].toLowerCase()}.`);
    }
    if (!canTransition(existing.status, status)) {
      return badRequest(
        `A ${TICKET_STATUS_LABELS[existing.status].toLowerCase()} ticket can't move straight to ` +
          `${TICKET_STATUS_LABELS[status].toLowerCase()}.`
      );
    }
    nextStatus = status;
  }

  // An assignee has to be someone who actually lives there. Left unchecked,
  // any user id would be accepted and the board would show a stranger's name
  // against the house's repair work.
  if (wantsAssignee && body.assignedToId) {
    const assigneeId = String(body.assignedToId);
    const member = await prisma.houseMember.findFirst({
      where: { houseId: existing.houseId, userId: assigneeId, status: "ACTIVE" },
      select: { id: true },
    });
    const landlord = await prisma.house.findFirst({
      where: { id: existing.houseId, landlordId: assigneeId },
      select: { id: true },
    });
    if (!member && !landlord) {
      return badRequest("You can only assign a ticket to someone in this house.");
    }
  }

  const ticket = await prisma.$transaction(async (tx) => {
    await tx.maintenanceTicket.update({
      where: { id: ticketId },
      data: {
        ...(wantsStatus ? { status: nextStatus } : {}),
        ...(wantsAssignee
          ? { assignedToId: body.assignedToId ? String(body.assignedToId) : null }
          : {}),
      },
    });

    // Only a status move earns a timeline row. Reassignment alone is recorded
    // as a note against the current status rather than a fake transition,
    // which would otherwise read as the ticket having moved when it did not.
    await tx.maintenanceTicketEvent.create({
      data: {
        ticketId,
        actorId: user.id,
        fromStatus: existing.status,
        toStatus: nextStatus,
        note: note || (wantsStatus ? null : "Reassigned"),
      },
    });

    return tx.maintenanceTicket.findUniqueOrThrow({
      where: { id: ticketId },
      include: TICKET_INCLUDE,
    });
  });

  return ok({ ticket: toTicketView(ticket) });
});
