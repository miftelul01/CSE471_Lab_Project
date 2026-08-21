"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card, EmptyState, ErrorNote, SuccessNote, buttonClass } from "@/components/ui";

type CalendarEvent = {
  id: string;
  sourceType: string;
  sourceId: string | null;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  syncedAt: Date | null;
  googleEventId: string | null;
};

function formatDate(date: Date | string): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSourceBadge(sourceType: string): React.ComponentProps<typeof Badge>["tone"] {
  switch (sourceType) {
    case "RENT":
      return "red";
    case "GUEST":
      return "blue";
    case "DISPUTE":
      return "amber";
    case "CHORE":
      return "green";
    default:
      return "slate";
  }
}

function getSourceLabel(sourceType: string): string {
  switch (sourceType) {
    case "RENT":
      return "Rent";
    case "GUEST":
      return "Guest";
    case "DISPUTE":
      return "Dispute";
    case "CHORE":
      return "Chore";
    default:
      return sourceType;
  }
}

export function CalendarClient({ events, houseId }: { events: CalendarEvent[]; houseId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function showFeedback(message: string | null, successMessage: string | null = null) {
    setError(message);
    setSuccess(successMessage);
  }

  async function handleSync() {
    if (isPending) return;
    showFeedback(null, null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        const data = await res.json();
        if (!res.ok) {
          showFeedback(data.error ?? "Failed to sync calendar");
          return;
        }

        setSuccess(data.message || "Calendar synced successfully");
        router.refresh();
      } catch {
        showFeedback("Network error. Please try again.");
      }
    });
  }

  const groupedEvents = events.reduce((acc, event) => {
    const source = event.sourceType;
    if (!acc[source]) acc[source] = [];
    acc[source].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">House Calendar Sync</p>
            <p className="mt-1 text-sm text-slate-600">
              Automatically syncs rent due dates, guest visits, dispute deadlines, and chore assignments to Google Calendar.
            </p>
          </div>
          <Badge tone="brand">{events.length} events</Badge>
        </div>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {success ? <SuccessNote>{success}</SuccessNote> : null}

        <button type="button" className={buttonClass} disabled={isPending} onClick={handleSync}>
          {isPending ? "Syncing..." : "Sync to Google Calendar"}
        </button>
      </Card>

      {events.length === 0 ? (
        <EmptyState
          title="No upcoming events"
          hint="Events will appear here automatically. Click sync to gather events from all house features."
        />
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedEvents).map(([sourceType, sourceEvents]) => (
            <Card key={sourceType}>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                {getSourceLabel(sourceType)} Events ({sourceEvents.length})
              </h2>
              <div className="space-y-2">
                {sourceEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-slate-900">{event.title}</h3>
                        <Badge tone={getSourceBadge(event.sourceType)}>{getSourceLabel(event.sourceType)}</Badge>
                        {event.syncedAt && <Badge tone="green">Synced</Badge>}
                      </div>
                      {event.description && (
                        <p className="mt-1 text-sm text-slate-600">{event.description}</p>
                      )}
                      <div className="mt-2 text-xs text-slate-500">
                        <span>Start: {formatDate(event.startsAt)}</span>
                        <span className="mx-2">•</span>
                        <span>End: {event.endsAt ? formatDate(event.endsAt) : "Not set"}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Event Sources</h2>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1"><Badge tone="red">Rent</Badge></div>
            <p className="text-slate-600">Monthly rent due dates from house settings</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1"><Badge tone="blue">Guest</Badge></div>
            <p className="text-slate-600">Guest check-in windows from guest log</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1"><Badge tone="amber">Dispute</Badge></div>
            <p className="text-slate-600">Voting deadlines from Mess Court</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1"><Badge tone="green">Chore</Badge></div>
            <p className="text-slate-600">Chore due dates from assignments</p>
          </div>
        </div>
      </Card>
    </div>
  );
}