import { ok, withUser } from "@/lib/api";
import { GOOGLE_SCOPES } from "@/lib/google";
import { prisma } from "@/lib/prisma";

/**
 * M3.4 — connection status for the current user only. Drives the
 * GoogleConnectCard UI. Never returns a token — only a derived boolean
 * summary of GoogleCredential.scopes/needsReconnectAt.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const credential = await prisma.googleCredential.findUnique({
    where: { userId: user.id },
    select: { scopes: true, needsReconnectAt: true },
  });

  return ok({
    tasksConnected: credential?.scopes.includes(GOOGLE_SCOPES.tasks) ?? false,
    calendarFreebusyConnected: credential?.scopes.includes(GOOGLE_SCOPES.calendarFreebusy) ?? false,
    needsReconnect: Boolean(credential?.needsReconnectAt),
    googleConfigured: Boolean(process.env.AUTH_GOOGLE_ID),
  });
});
