import { badRequest, ok, readJson, withAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/**
 * Moderation — a system administrator taking a post down anywhere on the
 * platform.
 *
 * Kept separate from the owner's own "delist": a landlord delisting their room
 * sets isActive, whereas this sets status = REMOVED and records who removed it
 * and why. Both are needed; conflating them would lose the audit trail and let
 * an owner silently undo a moderation decision.
 */

export const dynamic = "force-dynamic";

type Body = {
  kind: "listing" | "roommatePost";
  id: string;
  action: "remove" | "restore";
  reason?: string;
};

export const PATCH = withAdmin(async (user, req: Request) => {
  const body = await readJson<Body>(req);
  if (!body?.id || !body?.kind || !body?.action) {
    return badRequest("kind, id and action are required");
  }
  if (body.action === "remove" && !body.reason?.trim()) {
    return badRequest("Give a reason — the owner is told why their post was removed.");
  }

  const data =
    body.action === "remove"
      ? {
          status: "REMOVED" as const,
          removedReason: body.reason!.trim(),
          removedAt: new Date(),
          removedById: user.id,
        }
      : {
          status: "PUBLISHED" as const,
          removedReason: null,
          removedAt: null,
          removedById: null,
        };

  const updated =
    body.kind === "listing"
      ? await prisma.listing.update({ where: { id: body.id }, data })
      : await prisma.roommatePost.update({ where: { id: body.id }, data });

  return ok(updated);
});
