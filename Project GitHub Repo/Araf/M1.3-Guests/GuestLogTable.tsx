"use client";

import { useState, useTransition } from "react";
import { Badge, Card, EmptyState } from "@/components/ui";

type GuestStatus = "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED";

type GuestLog = {
  id: string;
  guestName: string;
  guestPhone: string | null;
  purpose: string | null;
  status: GuestStatus;
  checkedInAt: Date | string;
  checkedOutAt: Date | string | null;
  expectedCheckOut: Date | string | null;
  host: { name: string };
};

const STATUS_BADGE: Record<GuestStatus, React.ComponentProps<typeof Badge>["tone"]> = {
  CHECKED_IN: "green",
  CHECKED_OUT: "slate",
  CANCELLED: "red",
};

function formatDate(dateStr: Date | string | null): string {
  if (!dateStr) return "—";
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function checkOutGuest(guestId: string): Promise<{ error?: string }> {
  const res = await fetch("/api/guests", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guestId, status: "CHECKED_OUT" }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Failed to check out guest" };
  return {};
}

export function GuestLogTable({
  guests,
  onCheckOut,
}: {
  guests: GuestLog[];
  onCheckOut?: (guestId: string) => void;
}) {
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Split into currently in-house vs history
  const activeGuests = guests.filter((g) => g.status === "CHECKED_IN");
  const historyGuests = guests.filter((g) => g.status !== "CHECKED_IN");

  if (guests.length === 0) {
    return (
      <EmptyState title="No guests logged yet" hint="Use the form above to check in a guest." />
    );
  }

  function handleCheckOut(guestId: string) {
    if (isPending || checkingOut) return;
    setPendingError(null);
    setCheckingOut(guestId);
    startTransition(async () => {
      const result = await checkOutGuest(guestId);
      if (result.error) {
        setPendingError(result.error);
        setCheckingOut(null);
        return;
      }
      onCheckOut?.(guestId);
      setCheckingOut(null);
    });
  }

  return (
    <div className="space-y-4">
      {pendingError ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {pendingError}
        </p>
      ) : null}

      {/* Currently in house */}
      {activeGuests.length > 0 ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Currently in house ({activeGuests.length})
          </h2>
          <div className="divide-y divide-slate-100 text-sm">
            {activeGuests.map((guest) => (
              <div
                key={guest.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{guest.guestName}</p>
                  <p className="text-xs text-slate-500">
                    Host: {guest.host.name}
                    {guest.guestPhone ? ` · ${guest.guestPhone}` : ""}
                    {guest.purpose ? ` · ${guest.purpose}` : ""}
                  </p>
                  <p className="text-xs text-slate-400">
                    Checked in: {formatDate(guest.checkedInAt)}
                    {guest.expectedCheckOut
                      ? ` · Expected out: ${formatDate(guest.expectedCheckOut)}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge tone="green">In house</Badge>
                  <button
                    type="button"
                    disabled={isPending || checkingOut === guest.id}
                    onClick={() => handleCheckOut(guest.id)}
                    className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                  >
                    {checkingOut === guest.id ? "Checking out…" : "Check out"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* History */}
      {historyGuests.length > 0 ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            History ({historyGuests.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="pb-2 pr-4 font-medium text-slate-600">Guest</th>
                  <th className="pb-2 pr-4 font-medium text-slate-600">Host</th>
                  <th className="pb-2 pr-4 font-medium text-slate-600">Checked in</th>
                  <th className="pb-2 pr-4 font-medium text-slate-600">Checked out</th>
                  <th className="pb-2 font-medium text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyGuests.map((guest) => (
                  <tr key={guest.id} className="align-top">
                    <td className="py-2 pr-4">
                      <p className="font-medium text-slate-900">{guest.guestName}</p>
                      {guest.purpose ? (
                        <p className="text-xs text-slate-500">{guest.purpose}</p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4 text-slate-600">{guest.host.name}</td>
                    <td className="py-2 pr-4 text-slate-600">{formatDate(guest.checkedInAt)}</td>
                    <td className="py-2 pr-4 text-slate-600">{formatDate(guest.checkedOutAt)}</td>
                    <td className="py-2">
                      <Badge tone={STATUS_BADGE[guest.status]}>{guest.status.replace("_", " ")}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
