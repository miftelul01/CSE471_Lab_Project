import { PageHeader, Card, Badge, EmptyState, buttonClass } from "@/components/ui";
import { requireUser, getActiveHouseId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CalendarClient } from "./CalendarClient";

export const metadata = { title: "House calendar — Smart Mess" };

/** M3.6 Google Calendar API Integration — Md. Mahidul Alam Araf. */
export default async function CalendarPage() {
  const user = await requireUser();
  const houseId = await getActiveHouseId(user.id);

  if (!houseId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="House Calendar"
          subtitle="Sync critical house events to Google Calendar for better coordination."
        />
        <EmptyState
          title="Join a house to use the shared calendar"
          hint="The calendar is available once you are part of a house."
        />
      </div>
    );
  }

  const events = await prisma.calendarEvent.findMany({
    where: { houseId, startsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="House Calendar"
        subtitle="Sync critical house events to Google Calendar for better coordination."
      />
      <CalendarClient events={events} houseId={houseId} />
    </div>
  );
}
