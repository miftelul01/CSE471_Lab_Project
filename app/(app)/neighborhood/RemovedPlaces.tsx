"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, secondaryButtonClass } from "@/components/ui";
import {
  CATEGORY_LABELS,
  RESTORE_WINDOW_DAYS,
  daysBetween,
  formatDhakaDate,
  type BookmarkView,
} from "@/lib/neighborhood";

/**
 * "Recently removed", shown to the whole house.
 *
 * Soft-deleting a place is destructive and only reversible for 30 days, so it
 * is the one event in this feature that is not batched into the nightly digest
 * — the household finds out immediately. With no notification transport in the
 * codebase yet, immediate means this panel, on the page everyone opens, rather
 * than a message nobody receives.
 */
export function RemovedPlaces({
  removed,
  canRestore,
}: {
  removed: BookmarkView[];
  canRestore: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const restorable = removed.filter(
    (view) => view.deletedAt && daysBetween(new Date(view.deletedAt), now) <= RESTORE_WINDOW_DAYS
  );

  if (restorable.length === 0) return null;

  async function restore(id: string) {
    setBusyId(id);
    setError(null);

    const response = await fetch(`/api/neighborhood/bookmarks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restore: true }),
    });
    const body = await response.json();
    setBusyId(null);

    if (!response.ok) {
      setError(body.error ?? "Could not restore that place.");
      return;
    }
    router.refresh();
  }

  return (
    <Card className="border-rose-200 bg-rose-50/60">
      <h2 className="text-sm font-semibold text-rose-900">
        Recently removed from your map ({restorable.length})
      </h2>
      <p className="mt-0.5 text-xs text-rose-800">
        Enough residents reported these gone. They can be restored for {RESTORE_WINDOW_DAYS} days
        from the day they were removed, after which the notes go with them.
      </p>

      <ul className="mt-3 space-y-2">
        {restorable.map((view) => {
          const daysLeft =
            RESTORE_WINDOW_DAYS - daysBetween(new Date(view.deletedAt as string), now);
          return (
            <li
              key={view.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2"
            >
              <span className="min-w-0 text-sm">
                <span className="font-medium text-slate-800">{view.name}</span>
                <span className="ml-1.5 text-xs text-slate-500">
                  {CATEGORY_LABELS[view.category]} · removed{" "}
                  {formatDhakaDate(view.deletedAt as string)} · {daysLeft} day
                  {daysLeft === 1 ? "" : "s"} left to restore
                </span>
              </span>

              {canRestore ? (
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => restore(view.id)}
                  disabled={busyId === view.id}
                >
                  {busyId === view.id ? "Restoring…" : "Restore"}
                </button>
              ) : (
                <span className="text-xs text-slate-500">Your house admin can restore it</span>
              )}
            </li>
          );
        })}
      </ul>

      {error ? <p className="mt-2 text-sm text-rose-800">{error}</p> : null}
    </Card>
  );
}
