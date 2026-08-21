import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { GOOGLE_SCOPES } from "@/lib/google";
import { prisma } from "@/lib/prisma";

/**
 * M3.4 — best-effort disconnect for one scope. Optional companion to the
 * connect flow, not spec-required, but small enough to be worth having once
 * "connect" is offered at all.
 */

export const dynamic = "force-dynamic";

const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<{ scope: "tasks" | "calendar" }>(req);
  if (body?.scope !== "tasks" && body?.scope !== "calendar") {
    return badRequest("scope must be tasks or calendar");
  }
  const scopeToRemove = body.scope === "calendar" ? GOOGLE_SCOPES.calendarFreebusy : GOOGLE_SCOPES.tasks;

  const credential = await prisma.googleCredential.findUnique({ where: { userId: user.id } });
  if (!credential) return ok({ disconnected: true });

  const remainingScopes = credential.scopes.filter((s) => s !== scopeToRemove);

  // Best-effort — Google being unreachable shouldn't block the local
  // disconnect the resident actually asked for.
  if (credential.accessToken) {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(credential.accessToken)}`, {
      method: "POST",
    }).catch(() => {});
  }

  if (remainingScopes.length === 0) {
    await prisma.googleCredential.delete({ where: { userId: user.id } });
  } else {
    await prisma.googleCredential.update({
      where: { userId: user.id },
      data: { scopes: remainingScopes },
    });
  }

  return ok({ disconnected: true });
});
