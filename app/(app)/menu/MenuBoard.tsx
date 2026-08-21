"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge, Card, ErrorNote, SuccessNote, buttonClass, secondaryButtonClass } from "@/components/ui";
import { DAY_LABELS, NUTRITION_PROFILE_LABELS, STATUS_LABELS } from "@/lib/menu";
import type { DailyVoteStatus, NutritionProfile } from "@prisma/client";

type Candidate = {
  id: string;
  breakfast: string | null;
  lunch: string | null;
  dinner: string | null;
  estimatedCostPerHead: number | null;
  nutritionProfile: NutritionProfile | null;
  dietaryTags: string[];
  isMine: boolean;
  proposerName: string | null;
  recentlyServed: boolean;
  hiddenForYou: boolean;
};

type DayBoard = {
  dayOfWeek: number;
  status: DailyVoteStatus;
  decidedAt: string | null;
  fallbackReason: string | null;
  extendedUntil: string | null;
  roundDeadline: string | null;
  tieCandidateIds: string[];
  winningProposal: {
    id: string;
    breakfast: string | null;
    lunch: string | null;
    dinner: string | null;
    proposerName: string;
  } | null;
  candidates: Candidate[];
  myRanking: string[] | null;
};

const STATUS_TONE: Record<DailyVoteStatus, "amber" | "green" | "red" | "slate" | "blue"> = {
  OPEN: "amber",
  TIE_RUNOFF: "blue",
  EMERGENCY_REVOTE: "red",
  DECIDED: "green",
  FALLBACK: "slate",
};

function mealSummary(m: { breakfast: string | null; lunch: string | null; dinner: string | null }): string {
  const parts: string[] = [];
  if (m.breakfast) parts.push(`Breakfast: ${m.breakfast}`);
  if (m.lunch) parts.push(`Lunch: ${m.lunch}`);
  if (m.dinner) parts.push(`Dinner: ${m.dinner}`);
  return parts.join(" · ") || "No meals filled in";
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function MenuBoard() {
  const [weekStartDate, setWeekStartDate] = useState<string | null>(null);
  const [days, setDays] = useState<DayBoard[]>([]);
  const [canManageMenu, setCanManageMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string[]>>({});
  const [emergencyFor, setEmergencyFor] = useState<number | null>(null);
  const [emergencyReason, setEmergencyReason] = useState("");

  const load = useCallback(async (week?: string) => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/menu-proposals${week ? `?weekStartDate=${week}` : ""}`);
    const body = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Could not load the menu board");
      return;
    }
    const nextWeek = String(body.weekStartDate).slice(0, 10);
    setWeekStartDate(nextWeek);
    setDays(body.days);
    setCanManageMenu(body.canManageMenu);
    setDrafts((prev) => {
      const next: Record<number, string[]> = {};
      for (const d of body.days as DayBoard[]) {
        next[d.dayOfWeek] = prev[d.dayOfWeek] ?? d.myRanking ?? [];
      }
      return next;
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function addToRanking(dayOfWeek: number, id: string) {
    setDrafts((prev) => ({ ...prev, [dayOfWeek]: [...(prev[dayOfWeek] ?? []), id] }));
  }
  function removeFromRanking(dayOfWeek: number, id: string) {
    setDrafts((prev) => ({ ...prev, [dayOfWeek]: (prev[dayOfWeek] ?? []).filter((x) => x !== id) }));
  }
  function moveInRanking(dayOfWeek: number, index: number, delta: number) {
    setDrafts((prev) => {
      const list = [...(prev[dayOfWeek] ?? [])];
      const target = index + delta;
      if (target < 0 || target >= list.length) return prev;
      [list[index], list[target]] = [list[target], list[index]];
      return { ...prev, [dayOfWeek]: list };
    });
  }

  async function submitBallot(dayOfWeek: number) {
    if (!weekStartDate) return;
    setBusy(`ballot-${dayOfWeek}`);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/menu-proposals/ballot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStartDate, dayOfWeek, rankedProposalIds: drafts[dayOfWeek] ?? [] }),
    });
    const body = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Could not submit your ranking");
      return;
    }
    setMessage(`Your ranking for ${DAY_LABELS[dayOfWeek]} was submitted.`);
    void load(weekStartDate);
  }

  async function submitRunoffBallot(dayOfWeek: number, proposalId: string) {
    if (!weekStartDate) return;
    setBusy(`runoff-${dayOfWeek}`);
    setError(null);
    const res = await fetch("/api/menu-proposals/runoff-ballot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStartDate, dayOfWeek, rankedProposalIds: [proposalId] }),
    });
    const body = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Could not cast your runoff vote");
      return;
    }
    setMessage(`Your runoff vote for ${DAY_LABELS[dayOfWeek]} was recorded.`);
    void load(weekStartDate);
  }

  async function triggerEmergency(dayOfWeek: number) {
    if (!weekStartDate || !emergencyReason.trim()) return;
    setBusy(`emergency-${dayOfWeek}`);
    setError(null);
    const res = await fetch("/api/menu-proposals/emergency", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStartDate, dayOfWeek, reason: emergencyReason.trim() }),
    });
    const body = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Could not trigger the emergency re-vote");
      return;
    }
    setEmergencyFor(null);
    setEmergencyReason("");
    setMessage(`Emergency re-vote started for ${DAY_LABELS[dayOfWeek]}.`);
    void load(weekStartDate);
  }

  if (loading && days.length === 0) return <p className="text-sm text-slate-500">Loading the menu board…</p>;

  return (
    <div className="space-y-4">
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {message ? <SuccessNote>{message}</SuccessNote> : null}

      {weekStartDate ? (
        <div className="flex items-center justify-between">
          <button type="button" className={secondaryButtonClass} onClick={() => void load(addDaysISO(weekStartDate, -7))}>
            ← Previous week
          </button>
          <span className="text-sm font-medium text-slate-700">Week of {weekStartDate}</span>
          <button type="button" className={secondaryButtonClass} onClick={() => void load(addDaysISO(weekStartDate, 7))}>
            Next week →
          </button>
        </div>
      ) : null}

      {days.map((day) => {
        const ranking = drafts[day.dayOfWeek] ?? [];
        const rankedSet = new Set(ranking);
        const unranked = day.candidates.filter((c) => !rankedSet.has(c.id) && !c.hiddenForYou);
        const hidden = day.candidates.filter((c) => c.hiddenForYou);

        return (
          <Card key={day.dayOfWeek}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-medium text-slate-900">{DAY_LABELS[day.dayOfWeek]}</h2>
              <Badge tone={STATUS_TONE[day.status]}>{STATUS_LABELS[day.status]}</Badge>
            </div>

            {day.status === "DECIDED" || day.status === "FALLBACK" ? (
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                {day.winningProposal ? (
                  <>
                    <p className="font-medium text-slate-800">{mealSummary(day.winningProposal)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {day.status === "FALLBACK"
                        ? `Fell back to last week's winner (${(day.fallbackReason ?? "unspecified").replace(/_/g, " ")}).`
                        : `Proposed by ${day.winningProposal.proposerName}.`}
                    </p>
                  </>
                ) : (
                  <p className="text-slate-600">
                    Default safe meal
                    {day.fallbackReason ? ` — ${day.fallbackReason.replace(/_/g, " ")}` : ""}.
                  </p>
                )}

                {canManageMenu && day.status === "DECIDED" ? (
                  emergencyFor === day.dayOfWeek ? (
                    <div className="mt-3 flex gap-2">
                      <input
                        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                        placeholder="What's missing?"
                        value={emergencyReason}
                        onChange={(e) => setEmergencyReason(e.target.value)}
                      />
                      <button
                        type="button"
                        className="whitespace-nowrap rounded-lg bg-rose-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                        disabled={busy === `emergency-${day.dayOfWeek}` || !emergencyReason.trim()}
                        onClick={() => triggerEmergency(day.dayOfWeek)}
                      >
                        Start re-vote
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="mt-3 text-xs text-rose-600 underline"
                      onClick={() => setEmergencyFor(day.dayOfWeek)}
                    >
                      Flag a missing ingredient
                    </button>
                  )
                ) : null}
              </div>
            ) : day.status === "TIE_RUNOFF" || day.status === "EMERGENCY_REVOTE" ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  {day.status === "TIE_RUNOFF"
                    ? "Exact tie — pick one to break it:"
                    : "Emergency re-vote — pick a replacement:"}
                </p>
                {(day.status === "TIE_RUNOFF"
                  ? day.candidates.filter((c) => day.tieCandidateIds.includes(c.id))
                  : day.candidates.filter((c) => c.id !== day.winningProposal?.id)
                ).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-sm"
                  >
                    <span>{mealSummary(c)}</span>
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      disabled={busy === `runoff-${day.dayOfWeek}`}
                      onClick={() => submitRunoffBallot(day.dayOfWeek, c.id)}
                    >
                      Vote
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {day.candidates.length === 0 ? (
                  <p className="text-sm text-slate-500">No candidates yet for this day.</p>
                ) : (
                  <>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Your ranking</p>
                      {ranking.length === 0 ? (
                        <p className="text-xs text-slate-400">Add candidates below in your preferred order.</p>
                      ) : (
                        <ol className="space-y-1">
                          {ranking.map((id, i) => {
                            const c = day.candidates.find((x) => x.id === id);
                            if (!c) return null;
                            return (
                              <li
                                key={id}
                                className="flex items-center justify-between rounded-lg bg-brand-50 p-2 text-sm"
                              >
                                <span>
                                  #{i + 1} {mealSummary(c)}
                                </span>
                                <span className="flex gap-2">
                                  <button
                                    type="button"
                                    className="text-xs text-slate-500"
                                    onClick={() => moveInRanking(day.dayOfWeek, i, -1)}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    className="text-xs text-slate-500"
                                    onClick={() => moveInRanking(day.dayOfWeek, i, 1)}
                                  >
                                    ↓
                                  </button>
                                  <button
                                    type="button"
                                    className="text-xs text-rose-600"
                                    onClick={() => removeFromRanking(day.dayOfWeek, id)}
                                  >
                                    remove
                                  </button>
                                </span>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>

                    {unranked.length > 0 ? (
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                          Other candidates
                        </p>
                        <div className="space-y-1">
                          {unranked.map((c) => (
                            <div
                              key={c.id}
                              className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-sm"
                            >
                              <div>
                                <p>{mealSummary(c)}</p>
                                <p className="text-xs text-slate-500">
                                  {c.proposerName ? `by ${c.proposerName}` : "proposer hidden until decided"}
                                  {c.estimatedCostPerHead != null ? ` · ~৳${c.estimatedCostPerHead}/head` : ""}
                                  {c.nutritionProfile ? ` · ${NUTRITION_PROFILE_LABELS[c.nutritionProfile]}` : ""}
                                  {c.recentlyServed ? " · recently served" : ""}
                                </p>
                              </div>
                              <button
                                type="button"
                                className={secondaryButtonClass}
                                onClick={() => addToRanking(day.dayOfWeek, c.id)}
                              >
                                Add
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {hidden.length > 0 ? (
                      <p className="text-xs text-slate-400">
                        {hidden.length} candidate{hidden.length > 1 ? "s" : ""} hidden — conflicts with your dietary
                        restrictions.
                      </p>
                    ) : null}

                    <button
                      type="button"
                      className={buttonClass}
                      disabled={busy === `ballot-${day.dayOfWeek}` || ranking.length === 0}
                      onClick={() => submitBallot(day.dayOfWeek)}
                    >
                      Submit ranking
                    </button>
                  </>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
