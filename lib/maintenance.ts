import type { Prisma, TicketPriority, TicketStatus } from "@prisma/client";

/**
 * M3.1 Maintenance Ticket System — Miftelul Mehebub.
 *
 * Shared vocabulary and rules for tickets, kept out of the route handler so the
 * server page, the client components and the API all agree on what a legal
 * status move is. The UI hides buttons the API would reject; both read the
 * transition table below rather than each keeping their own copy.
 */

export const TICKET_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const TICKET_STATUS_TONES: Record<TicketStatus, "red" | "amber" | "green" | "slate"> = {
  OPEN: "red",
  IN_PROGRESS: "amber",
  RESOLVED: "green",
  CLOSED: "slate",
};

export const TICKET_PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const TICKET_PRIORITY_TONES: Record<TicketPriority, "slate" | "blue" | "amber" | "red"> = {
  LOW: "slate",
  MEDIUM: "blue",
  HIGH: "amber",
  URGENT: "red",
};

/** Free text in the database; a fixed list here so the board can group sensibly. */
export const TICKET_CATEGORIES = [
  "Plumbing",
  "Electrical",
  "Appliance",
  "Furniture",
  "Structural",
  "Pest control",
  "Internet",
  "Other",
] as const;

export const MAX_TICKET_TITLE = 120;
export const MAX_TICKET_DESCRIPTION = 2000;
export const MAX_TICKET_NOTE = 500;

/**
 * Legal status moves.
 *
 * The brief's flow is OPEN -> IN_PROGRESS -> RESOLVED, and the schema adds
 * CLOSED as the terminal state. Reopening is allowed from both RESOLVED and
 * CLOSED because "the tap is leaking again" is the same ticket, and forcing a
 * duplicate would break the per-house history the feature exists to keep.
 *
 * Skipping straight from OPEN to RESOLVED is deliberately permitted: plenty of
 * small jobs are done before anybody thinks to mark them started, and refusing
 * that just teaches people to click twice.
 */
export const TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["OPEN", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED", "OPEN"],
  CLOSED: ["OPEN"],
};

export const canTransition = (from: TicketStatus, to: TicketStatus): boolean =>
  TICKET_TRANSITIONS[from].includes(to);

/**
 * Whether a resident may still edit the ticket's own text.
 *
 * Once the house has acted on a report, rewriting what was reported would make
 * the history dishonest — the timeline would show a landlord responding to
 * words that are no longer there.
 */
export const isTicketEditable = (status: TicketStatus): boolean => status === "OPEN";

export type TicketInput = {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  priority?: unknown;
  photoUrl?: unknown;
};

export type ValidatedTicket = {
  title: string;
  description: string;
  category: string | null;
  priority: TicketPriority;
  photoUrl: string | null;
};

/**
 * There is no file storage in this project, so a photo is a link the resident
 * pastes rather than an upload. Restricted to http(s) on purpose: a `javascript:`
 * or `data:` URL rendered back into the board would be stored XSS, and this
 * value goes straight into an <img src>.
 */
export function normalizePhotoUrl(raw: unknown): { url: string | null } | { error: string } {
  if (raw === undefined || raw === null || raw === "") return { url: null };
  if (typeof raw !== "string") return { error: "Photo link must be text." };

  const trimmed = raw.trim();
  if (!trimmed) return { url: null };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: "Photo link must be a full URL, starting with http:// or https://." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Photo link must start with http:// or https://." };
  }
  return { url: parsed.toString() };
}

/** Returns the validated ticket, or a sentence explaining what is wrong with it. */
export function validateTicketInput(input: TicketInput): ValidatedTicket | { error: string } {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) return { error: "Give the problem a short title." };
  if (title.length > MAX_TICKET_TITLE) {
    return { error: `Title must be ${MAX_TICKET_TITLE} characters or fewer.` };
  }

  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length > MAX_TICKET_DESCRIPTION) {
    return { error: `Description must be ${MAX_TICKET_DESCRIPTION} characters or fewer.` };
  }

  const priority = (input.priority ?? "MEDIUM") as TicketPriority;
  if (!TICKET_PRIORITIES.includes(priority)) {
    return { error: `priority must be one of: ${TICKET_PRIORITIES.join(", ")}.` };
  }

  const category =
    typeof input.category === "string" && input.category.trim() ? input.category.trim() : null;

  const photo = normalizePhotoUrl(input.photoUrl);
  if ("error" in photo) return { error: photo.error };

  return { title, description, category, priority, photoUrl: photo.url };
}

export const TICKET_INCLUDE = {
  reportedBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  events: {
    orderBy: { createdAt: "asc" },
    include: { actor: { select: { id: true, name: true } } },
  },
} satisfies Prisma.MaintenanceTicketInclude;

type TicketRow = Prisma.MaintenanceTicketGetPayload<{ include: typeof TICKET_INCLUDE }>;

export type TicketEventView = {
  id: string;
  actorName: string | null;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  note: string | null;
  createdAt: string;
};

export type TicketView = {
  id: string;
  title: string;
  description: string;
  category: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  photoUrl: string | null;
  reportedById: string;
  reporterName: string | null;
  assigneeName: string | null;
  resolvedAt: string | null;
  createdAt: string;
  events: TicketEventView[];
};

/** Serialises a row for the client — Dates become ISO strings, relations flatten. */
export function toTicketView(row: TicketRow): TicketView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    priority: row.priority,
    photoUrl: row.photoUrl,
    reportedById: row.reportedById,
    reporterName: row.reportedBy?.name ?? null,
    assigneeName: row.assignedTo?.name ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    events: row.events.map((event) => ({
      id: event.id,
      actorName: event.actor?.name ?? null,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      note: event.note,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

/** Open work first, then by urgency, so the board leads with what needs doing. */
export function sortForBoard(tickets: TicketView[]): TicketView[] {
  const statusRank = { OPEN: 0, IN_PROGRESS: 1, RESOLVED: 2, CLOSED: 3 };
  const priorityRank = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return [...tickets].sort(
    (a, b) =>
      statusRank[a.status] - statusRank[b.status] ||
      priorityRank[a.priority] - priorityRank[b.priority] ||
      b.createdAt.localeCompare(a.createdAt)
  );
}

export function countByStatus(tickets: TicketView[]): Record<TicketStatus, number> {
  const counts: Record<TicketStatus, number> = {
    OPEN: 0,
    IN_PROGRESS: 0,
    RESOLVED: 0,
    CLOSED: 0,
  };
  for (const ticket of tickets) counts[ticket.status] += 1;
  return counts;
}
