"use client";

import { useState } from "react";

import { Badge, Card, secondaryButtonClass } from "@/components/ui";

type AdminInfo = {
  neverConnectedGoogleTasks: { id: string; name: string | null }[];
  needsGoogleReconnect: { id: string; name: string | null }[];
  coverageGaps: string[];
};

type ChoreOption = { id: string; name: string; frequency: string };

/** Only WEEKLY/BIWEEKLY chores have a meaningful "which weekday" pattern —
 * matches lib/chores.ts's WEEKDAY_SNAPPABLE_FREQUENCIES, which the server
 * enforces regardless of what this picker offers; filtering here just keeps
 * the tool from looking like it's broken on a DAILY/MONTHLY chore. */
const WEEKDAY_SNAPPABLE = new Set(["WEEKLY", "BIWEEKLY"]);

/**
 * House-admin-only. Two things live here: the live-computed gap/reconnect
 * banners (spec requirement 4 — a resident who's never connected, or whose
 * access was revoked, is flagged rather than silently skipped) and
 * enhancement C's due-date-suggestion tool + enhancement E's toggle.
 */
export function AdminSettingsPanel({
  adminInfo,
  choreQualityRatingEnabled,
  chores,
  onChanged,
}: {
  adminInfo: AdminInfo | null;
  choreQualityRatingEnabled: boolean;
  chores: ChoreOption[];
  onChanged: () => void;
}) {
  const [selectedChoreId, setSelectedChoreId] = useState("");
  const [suggestion, setSuggestion] = useState<{ dayName: string; sampleSize: number } | null | "none">(null);
  const [busy, setBusy] = useState(false);

  const weekdaySnappableChores = chores.filter((c) => WEEKDAY_SNAPPABLE.has(c.frequency));

  async function checkSuggestion() {
    if (!selectedChoreId) return;
    setBusy(true);
    const res = await fetch(`/api/chores/${selectedChoreId}/due-date-suggestion`);
    const body = await res.json();
    setBusy(false);
    setSuggestion(body.suggestion ?? "none");
  }

  async function applySuggestion(dayOfWeek: number) {
    setBusy(true);
    await fetch(`/api/chores/${selectedChoreId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDayOfWeek: dayOfWeek }),
    });
    setBusy(false);
    setSuggestion(null);
    onChanged();
  }

  async function toggleRatings(enabled: boolean) {
    await fetch("/api/chores/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choreQualityRatingEnabled: enabled }),
    });
    onChanged();
  }

  const hasBanners =
    adminInfo &&
    (adminInfo.neverConnectedGoogleTasks.length > 0 ||
      adminInfo.needsGoogleReconnect.length > 0 ||
      adminInfo.coverageGaps.length > 0);

  return (
    <Card className="border-slate-300">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">House admin</h2>

      {hasBanners ? (
        <div className="mb-3 space-y-1.5">
          {adminInfo!.coverageGaps.length > 0 ? (
            <p className="text-xs text-rose-700">
              No eligible resident for: {adminInfo!.coverageGaps.join(", ")} — everyone in the rotation
              is either away or no longer in the house.
            </p>
          ) : null}
          {adminInfo!.neverConnectedGoogleTasks.length > 0 ? (
            <p className="text-xs text-amber-700">
              Never connected Google Tasks: {adminInfo!.neverConnectedGoogleTasks.map((u) => u.name ?? "someone").join(", ")}
            </p>
          ) : null}
          {adminInfo!.needsGoogleReconnect.length > 0 ? (
            <p className="text-xs text-amber-700">
              Needs to reconnect Google Tasks: {adminInfo!.needsGoogleReconnect.map((u) => u.name ?? "someone").join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={choreQualityRatingEnabled}
            onChange={(e) => toggleRatings(e.target.checked)}
          />
          Let residents rate how well a chore was actually done (anonymous, optional)
        </label>
      </div>

      {weekdaySnappableChores.length > 0 ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="mb-1.5 text-xs font-medium text-slate-700">Suggest a better due date</p>
          <p className="mb-1.5 text-xs text-slate-400">Weekly and every-2-weeks chores only.</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
              value={selectedChoreId}
              onChange={(e) => {
                setSelectedChoreId(e.target.value);
                setSuggestion(null);
              }}
            >
              <option value="">Pick a chore…</option>
              {weekdaySnappableChores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={checkSuggestion}
              disabled={!selectedChoreId || busy}
            >
              Check pattern
            </button>
          </div>
          {suggestion === "none" ? (
            <p className="mt-1.5 text-xs text-slate-500">No clear pattern yet.</p>
          ) : suggestion ? (
            <div className="mt-1.5 flex items-center gap-2">
              <Badge tone="blue">
                Usually completed on {suggestion.dayName} ({suggestion.sampleSize} occurrences)
              </Badge>
              <button
                type="button"
                className="text-xs text-brand-700 underline"
                onClick={() => {
                  const dayIndex = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(
                    suggestion.dayName
                  );
                  applySuggestion(dayIndex);
                }}
              >
                Apply
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
