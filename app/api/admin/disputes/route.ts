import { badRequest, ok, readJson, withAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import type { DisputeState } from "@prisma/client";

/**
 * Common Workflow 2 — "resolve escalated disputes".
 *
 * A dispute reaches here when its house could not settle it. The state machine
 * in the domain_rules migration already permits only ESCALATED -> RESOLVED and
 * ESCALATED -> ARCHIVED and rejects anything else at the database level, so
 * this endpoint asks for the transition and lets the trigger refuse it rather
 * than duplicating those rules in TypeScript.
 */

export const dynamic = "force-dynamic";

/** Terminal moves an admin may make on an escalated dispute. */
const ADMIN_TRANSITIONS: DisputeState[] = ["RESOLVED", "ARCHIVED"];

export const GET = withAdmin(async (_user, req: Request) => {
  const state = new URL(req.url).searchParams.get("state") ?? "ESCALATED";

  const disputes = await prisma.dispute.findMany({
    where: state === "ALL" ? undefined : { state: state as DisputeState },
    include: {
      house: { select: { id: true, name: true } },
      votes: { select: { vote: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { escalatedAt: "asc" },
  });

  return ok({ disputes });
});

export const PATCH = withAdmin(async (user, req: Request) => {
  const body = await readJson<{ id: string; state: DisputeState; resolution?: string }>(req);
  if (!body?.id || !body?.state) return badRequest("id and state are required");

  if (!ADMIN_TRANSITIONS.includes(body.state)) {
    return badRequest(`An admin can only move a dispute to: ${ADMIN_TRANSITIONS.join(" or ")}.`);
  }
  if (body.state === "RESOLVED" && !body.resolution?.trim()) {
    return badRequest("Give a resolution note so the house can see how it was settled.");
  }

  const current = await prisma.dispute.findUnique({
    where: { id: body.id },
    select: { state: true },
  });
  if (!current) return badRequest("No such dispute.");

  // The audit row is written here rather than by a trigger: the database can
  // no longer tell who is acting, so the actor is recorded in the same
  // transaction as the transition itself. If the trigger rejects the move, the
  // event row rolls back with it.
  const [dispute] = await prisma.$transaction([
    prisma.dispute.update({
      where: { id: body.id },
      data: { state: body.state, ...(body.resolution ? { resolution: body.resolution } : {}) },
    }),
    prisma.disputeEvent.create({
      data: {
        disputeId: body.id,
        actorId: user.id,
        fromState: current.state,
        toState: body.state,
        note: body.resolution ?? null,
      },
    }),
  ]);

  return ok(dispute);
});
