"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, EmptyState, ErrorNote, buttonClass, secondaryButtonClass } from "@/components/ui";
import { DAY_LABELS, MEAL_TYPE_LABELS } from "@/lib/menu";
import type { MealType, ProposalStatus } from "@prisma/client";

type Item = { id: string; dayOfWeek: number; mealType: MealType; description: string };
type Vote = { userId: string; vote: number };
type Proposal = {
  id: string;
  title: string;
  weekStartDate: Date;
  status: ProposalStatus;
  createdAt: Date;
  items: Item[];
  votes: Vote[];
  proposedBy: { id: string; name: string };
};

function formatWeek(date: Date) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function scoreOf(votes: Vote[]) {
  return votes.reduce((sum, v) => sum + v.vote, 0);
}

/** Groups a proposal's items by day, in Monday-first order, meal types in menu order. */
function itemsByDay(items: Item[]) {
  return DAY_LABELS.map((label, dayOfWeek) => ({
    label,
    items: items.filter((i) => i.dayOfWeek === dayOfWeek).sort((a, b) => {
      const order: MealType[] = ["BREAKFAST", "LUNCH", "DINNER"];
      return order.indexOf(a.mealType) - order.indexOf(b.mealType);
    }),
  })).filter((day) => day.items.length > 0);
}

export function MenuBoard({
  approvedMenu,
  openProposals,
  currentUserId,
  canCloseVoting,
}: {
  approvedMenu: Proposal | null;
  openProposals: Proposal[];
  currentUserId: string;
  canCloseVoting: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function castVote(proposalId: string, vote: 1 | -1) {
    setBusyId(proposalId);
    setError(null);
    const res = await fetch(`/api/menu-proposals/${proposalId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vote }),
    });
    const body = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(body.error ?? "Could not cast vote");
      return;
    }
    router.refresh();
  }

  async function closeVoting(weekStartDate: Date) {
    const key = `close-${weekStartDate.toISOString()}`;
    setBusyId(key);
    setError(null);
    const res = await fetch("/api/menu-proposals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStartDate: weekStartDate.toISOString() }),
    });
    const body = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(body.error ?? "Could not close voting");
      return;
    }
    router.refresh();
  }

  // One "close voting" action per distinct week among the open proposals.
  const weeksOpen = Array.from(new Set(openProposals.map((p) => p.weekStartDate.toString()))).map(
    (iso) => openProposals.find((p) => p.weekStartDate.toString() === iso)!.weekStartDate
  );

  return (
    <div className="space-y-8">
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">This week&apos;s official menu</h2>
        {approvedMenu ? (
          <Card>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="font-medium text-slate-900">{approvedMenu.title}</h3>
                <p className="text-xs text-slate-500">Week of {formatWeek(approvedMenu.weekStartDate)}</p>
              </div>
              <Badge tone="green">Official</Badge>
            </div>
            <div className="space-y-3">
              {itemsByDay(approvedMenu.items).map((day) => (
                <div key={day.label} className="text-sm">
                  <p className="font-medium text-slate-800">{day.label}</p>
                  <ul className="mt-0.5 space-y-0.5 text-slate-600">
                    {day.items.map((item) => (
                      <li key={item.id}>
                        <span className="text-slate-500">{MEAL_TYPE_LABELS[item.mealType]}:</span>{" "}
                        {item.description}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <EmptyState
            title="No menu finalized yet"
            hint="Propose a menu below, get your housemates to vote, then close voting to make it official."
          />
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Open proposals</h2>
          {canCloseVoting && weeksOpen.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {weeksOpen.map((week) => (
                <button
                  key={week.toString()}
                  type="button"
                  className={secondaryButtonClass}
                  disabled={busyId === `close-${week.toISOString()}`}
                  onClick={() => closeVoting(week)}
                >
                  {busyId === `close-${week.toISOString()}`
                    ? "Closing…"
                    : `Close voting — week of ${formatWeek(week)}`}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {openProposals.length === 0 ? (
          <EmptyState
            title="No open proposals"
            hint="Be the first to propose next week's menu."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {openProposals.map((proposal) => {
              const score = scoreOf(proposal.votes);
              const myVote = proposal.votes.find((v) => v.userId === currentUserId)?.vote ?? 0;
              return (
                <Card key={proposal.id}>
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h3 className="font-medium text-slate-900">{proposal.title}</h3>
                    <Badge tone={score > 0 ? "green" : score < 0 ? "red" : "slate"}>
                      {score > 0 ? `+${score}` : score}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Week of {formatWeek(proposal.weekStartDate)} · proposed by {proposal.proposedBy.name || "—"}
                  </p>

                  <div className="mt-3 space-y-2">
                    {itemsByDay(proposal.items).map((day) => (
                      <div key={day.label} className="text-sm">
                        <p className="font-medium text-slate-800">{day.label}</p>
                        <ul className="mt-0.5 space-y-0.5 text-slate-600">
                          {day.items.map((item) => (
                            <li key={item.id}>
                              <span className="text-slate-500">{MEAL_TYPE_LABELS[item.mealType]}:</span>{" "}
                              {item.description}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      className={myVote === 1 ? buttonClass : secondaryButtonClass}
                      disabled={busyId === proposal.id}
                      onClick={() => castVote(proposal.id, 1)}
                    >
                      👍 Upvote
                    </button>
                    <button
                      type="button"
                      className={myVote === -1 ? buttonClass : secondaryButtonClass}
                      disabled={busyId === proposal.id}
                      onClick={() => castVote(proposal.id, -1)}
                    >
                      👎 Downvote
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
