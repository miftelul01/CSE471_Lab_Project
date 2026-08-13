import { badRequest, notImplemented, ok, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** M3.6 Google Calendar API Integration — Md. Mahidul Alam Araf. */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before using the shared calendar.");

  const events = await prisma.calendarEvent.findMany({
    where: { houseId, startsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
  });
  return ok({ events });
});

/**
 * TODO (M3.6): sync to Google Calendar.
 *  1. Gather events (rent due, guest windows, dispute deadlines).
 *  2. Upsert CalendarEvent on (sourceType, sourceId) — that unique pair is what
 *     stops every sync run duplicating the same event.
 *  3. Read the OAuth token from GoogleCredential. That table used to be
 *     unreadable from the browser because it had RLS on and no policies; now
 *     nothing stops a query, so never expose it through a route that returns
 *     it to the client.
 */
export const POST = withUser(async () => notImplemented("Syncing the house calendar"));
