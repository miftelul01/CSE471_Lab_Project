"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, ErrorNote, inputClass, secondaryButtonClass } from "@/components/ui";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_TONES,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_TONES,
  TICKET_TRANSITIONS,
  type TicketView,
} from "@/lib/maintenance";
import type { TicketStatus } from "@prisma/client";

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * M3.1 — the house's ticket board and per-ticket history.
 *
 * `canManage` mirrors assertCanSetTicketStatus on the server: the status
 * buttons and the assignee picker only render for a landlord or house admin.
 * The next legal statuses come from TICKET_TRANSITIONS, the same table the API
 * validates against, so the UI cannot offer a move the route would reject.
 */
export function TicketBoard({
  tickets,
  currentUserId,
  canManage,
  members,
}: {
  tickets: TicketView[];
  currentUserId: string;
  canManage: boolean;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function patch(ticketId: string, payload: Record<string, unknown>) {
    setBusyId(ticketId);
    setError(null);

    const response = await fetch("/api/maintenance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, ...payload }),
    });
    const body = await response.json();

    setBusyId(null);
    if (!response.ok) {
      setError(body.error ?? "Could not update that ticket");
      return;
    }
    setNote("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {tickets.map((ticket) => {
        const isOpen = expanded === ticket.id;
        const busy = busyId === ticket.id;

        return (
          <Card key={ticket.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TICKET_STATUS_TONES[ticket.status]}>
                    {TICKET_STATUS_LABELS[ticket.status]}
                  </Badge>
                  <Badge tone={TICKET_PRIORITY_TONES[ticket.priority]}>
                    {TICKET_PRIORITY_LABELS[ticket.priority]}
                  </Badge>
                  {ticket.category ? <Badge>{ticket.category}</Badge> : null}
                </div>

                <h3 className="mt-2 font-medium text-slate-900">{ticket.title}</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Reported by{" "}
                  {ticket.reportedById === currentUserId
                    ? "you"
                    : (ticket.reporterName ?? "a housemate")}{" "}
                  on {formatWhen(ticket.createdAt)}
                  {ticket.assigneeName ? ` · assigned to ${ticket.assigneeName}` : ""}
                </p>
              </div>

              <button
                type="button"
                className="text-sm text-slate-600 hover:text-slate-900"
                onClick={() => setExpanded(isOpen ? null : ticket.id)}
              >
                {isOpen ? "Hide" : `History (${ticket.events.length})`}
              </button>
            </div>

            {ticket.description ? (
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                {ticket.description}
              </p>
            ) : null}

            {ticket.photoUrl ? (
              <a
                href={ticket.photoUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ticket.photoUrl}
                  alt={`Photo for ${ticket.title}`}
                  className="max-h-40 rounded-lg border border-slate-200 object-cover"
                />
              </a>
            ) : null}

            {canManage ? (
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Move to
                  </span>
                  {TICKET_TRANSITIONS[ticket.status].map((next: TicketStatus) => (
                    <button
                      key={next}
                      type="button"
                      className={secondaryButtonClass}
                      disabled={busy}
                      onClick={() => patch(ticket.id, { status: next, note })}
                    >
                      {TICKET_STATUS_LABELS[next]}
                    </button>
                  ))}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    className={inputClass}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Note for the history (optional)"
                    maxLength={500}
                  />
                  {/* Uncontrolled on purpose: it is an action picker, not a
                      field. router.refresh() re-renders the row with the new
                      assignee shown in the header above. */}
                  <select
                    className={inputClass}
                    defaultValue=""
                    disabled={busy}
                    onChange={(event) =>
                      patch(ticket.id, { assignedToId: event.target.value || null })
                    }
                  >
                    <option value="">Assign to…</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            {isOpen ? (
              <ol className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                {ticket.events.map((event) => (
                  <li key={event.id} className="flex gap-3 text-sm">
                    <span className="tabular shrink-0 text-xs text-slate-500">
                      {formatWhen(event.createdAt)}
                    </span>
                    <span className="text-slate-700">
                      {event.fromStatus
                        ? `${TICKET_STATUS_LABELS[event.fromStatus]} → ${TICKET_STATUS_LABELS[event.toStatus]}`
                        : TICKET_STATUS_LABELS[event.toStatus]}
                      {event.actorName ? ` · ${event.actorName}` : ""}
                      {event.note ? ` — ${event.note}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
