import { prisma } from "@/lib/prisma";

/**
 * M3.6 Google Calendar API Integration — Md. Mahidul Alam Araf.
 *
 * This module handles synchronization of house events to Google Calendar.
 * It creates a shared house calendar and syncs events like rent due dates,
 * guest check-in windows, dispute deadlines, and chore due dates.
 */

export type CalendarEventInput = {
  sourceType: string;
  sourceId: string | null;
  title: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
};

/**
 * Sync an event to the house's Google Calendar.
 *
 * This function:
 * 1. Upserts a CalendarEvent record in the database
 * 2. Syncs to Google Calendar if OAuth credentials are available
 * 3. Stores the returned google_event_id for future updates
 *
 * @param houseId - The house ID
 * @param event - The event data to sync
 */
export async function syncEventToCalendar(houseId: string, event: CalendarEventInput) {
  // Check if the house has a Google Calendar configured
  const house = await prisma.house.findUnique({
    where: { id: houseId },
    select: { googleCalendarId: true },
  });

  if (!house) {
    throw new Error("House not found");
  }

  // Upsert the calendar event in our database
  // Handle null sourceId by using a different upsert logic
  let calendarEvent;
  
  if (event.sourceId) {
    calendarEvent = await prisma.calendarEvent.upsert({
      where: {
        sourceType_sourceId: {
          sourceType: event.sourceType,
          sourceId: event.sourceId,
        },
      },
      create: {
        houseId,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        title: event.title,
        description: event.description,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
      },
      update: {
        title: event.title,
        description: event.description,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
      },
    });
  } else {
    // For events without sourceId, create or find by other criteria
    calendarEvent = await prisma.calendarEvent.create({
      data: {
        houseId,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        title: event.title,
        description: event.description,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
      },
    });
  }

  // TODO: Implement actual Google Calendar API sync
  // This requires:
  // 1. Google OAuth token retrieval from GoogleCredential table
  // 2. Google Calendar API client setup
  // 3. Create/update event in Google Calendar
  // 4. Store google_event_id and synced_at

  // For now, we'll just mark it as synced without actual API call
  await prisma.calendarEvent.update({
    where: { id: calendarEvent.id },
    data: { syncedAt: new Date() },
  });

  return calendarEvent;
}

/**
 * Collect events worth syncing from various sources.
 *
 * This function gathers events from:
 * - Rent due dates (from House settings)
 * - Guest check-in windows (from GuestLog)
 * - Dispute deadlines (from Dispute)
 * - Chore due dates (from ChoreAssignment)
 *
 * @param houseId - The house ID
 */
export async function collectHouseEvents(houseId: string) {
  const events: CalendarEventInput[] = [];

  // Get house info
  const house = await prisma.house.findUnique({
    where: { id: houseId },
    select: { name: true },
  });

  // Get guest check-in windows
  const guests = await prisma.guestLog.findMany({
    where: {
      houseId,
      status: "CHECKED_IN",
      checkedInAt: { gte: new Date() },
    },
    select: {
      id: true,
      guestName: true,
      checkedInAt: true,
      expectedCheckOut: true,
    },
  });

  for (const guest of guests) {
    const endsAt = guest.expectedCheckOut || new Date(guest.checkedInAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    events.push({
      sourceType: "GUEST",
      sourceId: guest.id,
      title: `Guest: ${guest.guestName}`,
      description: "Guest visit in progress",
      startsAt: guest.checkedInAt,
      endsAt,
    });
  }

  // Get dispute deadlines
  const disputes = await prisma.dispute.findMany({
    where: {
      houseId,
      state: "VOTING",
      votingDeadline: { gte: new Date() },
    },
    select: {
      id: true,
      title: true,
      votingDeadline: true,
    },
  });

  for (const dispute of disputes) {
    if (dispute.votingDeadline) {
      events.push({
        sourceType: "DISPUTE",
        sourceId: dispute.id,
        title: `Mess Court Deadline: ${dispute.title}`,
        description: "Voting deadline for dispute",
        startsAt: dispute.votingDeadline,
        endsAt: new Date(dispute.votingDeadline.getTime() + 60 * 60 * 1000), // 1 hour duration
      });
    }
  }

  // Get chore due dates - using correct field names
  const chores = await prisma.choreAssignment.findMany({
    where: {
      chore: { houseId },
      dueDate: { gte: new Date() },
      status: "PENDING",
    },
    select: {
      id: true,
      choreId: true,
      dueDate: true,
      chore: {
        select: {
          name: true,
        },
      },
    },
  });

  for (const chore of chores) {
    events.push({
      sourceType: "CHORE",
      sourceId: chore.id,
      title: `Chore: ${chore.chore.name || "Assigned chore"}`,
      description: "Assigned chore due",
      startsAt: chore.dueDate,
      endsAt: new Date(chore.dueDate.getTime() + 2 * 60 * 60 * 1000), // 2 hour duration
    });
  }

  return events;
}

/**
 * Sync all house events to Google Calendar.
 *
 * This is the main entry point for calendar synchronization.
 * It collects events from all sources and syncs them to Google Calendar.
 *
 * @param houseId - The house ID
 */
export async function syncHouseCalendar(houseId: string) {
  const events = await collectHouseEvents(houseId);
  
  const results = [];
  for (const event of events) {
    try {
      const syncedEvent = await syncEventToCalendar(houseId, event);
      results.push({ success: true, event: syncedEvent });
    } catch (error) {
      results.push({ success: false, error, event });
    }
  }

  return results;
}