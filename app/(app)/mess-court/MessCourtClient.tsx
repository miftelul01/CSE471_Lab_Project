"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { DisputeState, DisputeVoteValue } from "@prisma/client";
import { Badge, Card, EmptyState, ErrorNote, SuccessNote, Field, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import type { MessCourtPageData, DisputeView } from "@/Araf/M3.5-MessCourt/disputes";

const STATE_LABELS: Record<DisputeState, string> = {
  RAISED: "Raised",
  VOTING: "Voting",
  RESOLVED: "Resolved",
  ESCALATED: "Escalated",
  ARCHIVED: "Archived",
};

const STATE_BADGE: Record<DisputeState, React.ComponentProps<typeof Badge>["tone"]> = {
  RAISED: "amber",
  VOTING: "blue",
  RESOLVED: "green",
  ESCALATED: "red",
  ARCHIVED: "slate",
};

const VOTE_LABELS: Record<DisputeVoteValue, string> = {
  FOR: "For",
  AGAINST: "Against",
  ABSTAIN: "Abstain",
};

function formatDate(dateStr: Date | string): string {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupDisputesByState(disputes: DisputeView[]) {
  const grouped = new Map<DisputeState, DisputeView[]>();
  for (const dispute of disputes) {
    const bucket = grouped.get(dispute.state) ?? [];
    bucket.push(dispute);
    grouped.set(dispute.state, bucket);
  }
  return grouped;
}

export function MessCourtClient({ house, canManageHouse, disputes, activeMembers }: MessCourtPageData) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [votingDisputeId, setVotingDisputeId] = useState<string | null>(null);

  const groupedDisputes = groupDisputesByState(disputes);

  function showFeedback(message: string | null, successMessage: string | null = null) {
    setError(message);
    setSuccess(successMessage);
  }

  async function handleCreateDispute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "");
    const description = String(formData.get("description") ?? "");
    const category = String(formData.get("category") ?? "");
    const againstUserId = String(formData.get("againstUserId") ?? "") || null;

    showFeedback(null, null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/disputes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description, category, againstUserId }),
        });

        const data = await res.json();
        if (!res.ok) {
          showFeedback(data.error ?? "Failed to create dispute");
          return;
        }

        setSuccess("Dispute created successfully");
        setShowCreateForm(false);
        router.refresh();
      } catch {
        showFeedback("Network error. Please try again.");
      }
    });
  }

  async function handleTransition(disputeId: string, targetState: DisputeState, note?: string, resolution?: string) {
    if (isPending) return;
    showFeedback(null, null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/disputes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ disputeId, targetState, note, resolution }),
        });

        const data = await res.json();
        if (!res.ok) {
          showFeedback(data.error ?? "Failed to transition dispute");
          return;
        }

        setSuccess("Dispute updated successfully");
        router.refresh();
      } catch {
        showFeedback("Network error. Please try again.");
      }
    });
  }

  async function handleVote(disputeId: string, vote: DisputeVoteValue, comment?: string) {
    if (isPending) return;
    setVotingDisputeId(disputeId);
    showFeedback(null, null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/disputes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ disputeId, vote, comment }),
        });

        const data = await res.json();
        if (!res.ok) {
          showFeedback(data.error ?? "Failed to cast vote");
          setVotingDisputeId(null);
          return;
        }

        setSuccess("Vote cast successfully");
        setVotingDisputeId(null);
        router.refresh();
      } catch {
        showFeedback("Network error. Please try again.");
        setVotingDisputeId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">{house.name}</p>
            <p className="mt-1 text-sm text-slate-600">
              Formal conflict resolution with state machine governance. All transitions are logged and enforced at the database level.
            </p>
          </div>
          <Badge tone="brand">{disputes.length} disputes</Badge>
        </div>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {success ? <SuccessNote>{success}</SuccessNote> : null}

        <button
          type="button"
          className={buttonClass}
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? "Cancel" : "Raise New Dispute"}
        </button>

        {showCreateForm && (
          <form onSubmit={handleCreateDispute} className="mt-4 space-y-4 rounded-lg border border-dashed border-slate-200 p-4">
            <Field label="Title" hint="Brief description of the dispute">
              <input type="text" name="title" className={inputClass} required disabled={isPending} />
            </Field>

            <Field label="Description" hint="Detailed explanation of the issue">
              <textarea name="description" className={inputClass} rows={3} disabled={isPending} />
            </Field>

            <Field label="Category" hint="Type of dispute (e.g., noise, unpaid bills, cleanliness)">
              <input type="text" name="category" className={inputClass} disabled={isPending} />
            </Field>

            <Field label="Against (optional)" hint="User ID if this is against a specific person">
              <input type="text" name="againstUserId" className={inputClass} disabled={isPending} />
            </Field>

            <button type="submit" className={buttonClass} disabled={isPending}>
              {isPending ? "Creating..." : "Raise Dispute"}
            </button>
          </form>
        )}
      </div>

      {disputes.length === 0 ? (
        <EmptyState title="No disputes yet" hint="Use the form above to raise a dispute." />
      ) : (
        <div className="space-y-4">
          {Array.from(groupedDisputes.entries()).map(([state, stateDisputes]) => (
            <Card key={state}>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                {STATE_LABELS[state]} ({stateDisputes.length})
              </h2>
              <div className="space-y-3">
                {stateDisputes.map((dispute) => (
                  <DisputeCard
                    key={dispute.id}
                    dispute={dispute}
                    canManageHouse={canManageHouse}
                    onTransition={handleTransition}
                    onVote={handleVote}
                    isVoting={votingDisputeId === dispute.id}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function DisputeCard({
  dispute,
  canManageHouse,
  onTransition,
  onVote,
  isVoting,
}: {
  dispute: DisputeView;
  canManageHouse: boolean;
  onTransition: (id: string, state: DisputeState, note?: string, resolution?: string) => void;
  onVote: (id: string, vote: DisputeVoteValue, comment?: string) => void;
  isVoting: boolean;
}) {
  const [showDetails, setShowDetails] = useState(false);

  const validTransitions: Record<DisputeState, DisputeState[]> = {
    RAISED: ["VOTING", "ARCHIVED"],
    VOTING: ["RESOLVED", "ESCALATED", "ARCHIVED"],
    RESOLVED: ["ARCHIVED"],
    ESCALATED: ["RESOLVED", "ARCHIVED"],
    ARCHIVED: [],
  };

  const possibleTransitions = validTransitions[dispute.state];

  const voteCounts = {
    FOR: dispute.votes.filter((v) => v.vote === "FOR").length,
    AGAINST: dispute.votes.filter((v) => v.vote === "AGAINST").length,
    ABSTAIN: dispute.votes.filter((v) => v.vote === "ABSTAIN").length,
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-slate-900">{dispute.title}</h3>
            <Badge tone={STATE_BADGE[dispute.state]}>{STATE_LABELS[dispute.state]}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">{dispute.description}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
            <span>By: {dispute.raisedBy.name}</span>
            {dispute.againstUser && <span>Against: {dispute.againstUser.name}</span>}
            <span>Created: {formatDate(dispute.createdAt)}</span>
            {dispute.votingDeadline && <span>Deadline: {formatDate(dispute.votingDeadline)}</span>}
          </div>
        </div>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? "Hide" : "Details"}
        </button>
      </div>

      {showDetails && (
        <div className="mt-4 space-y-4">
          {/* Voting Section */}
          {dispute.state === "VOTING" && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <h4 className="mb-2 text-sm font-semibold text-slate-900">Vote on this dispute</h4>
              <div className="flex flex-wrap gap-2">
                {(["FOR", "AGAINST", "ABSTAIN"] as DisputeVoteValue[]).map((vote) => (
                  <button
                    key={vote}
                    type="button"
                    className={`${secondaryButtonClass} ${isVoting ? "opacity-50" : ""}`}
                    disabled={isVoting}
                    onClick={() => onVote(dispute.id, vote)}
                  >
                    {VOTE_LABELS[vote]} ({voteCounts[vote]})
                  </button>
                ))}
              </div>
              <div className="mt-2 text-xs text-slate-600">
                Total votes: {dispute.votes.length}
              </div>
            </div>
          )}

          {/* State Transitions */}
          {possibleTransitions.length > 0 && canManageHouse && (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <h4 className="mb-2 text-sm font-semibold text-slate-900">Transition dispute</h4>
              <div className="flex flex-wrap gap-2">
                {possibleTransitions.map((targetState) => (
                  <button
                    key={targetState}
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => onTransition(dispute.id, targetState)}
                  >
                    Move to {STATE_LABELS[targetState]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Resolution */}
          {dispute.resolution && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <h4 className="mb-1 text-sm font-semibold text-slate-900">Resolution</h4>
              <p className="text-sm text-slate-700">{dispute.resolution}</p>
            </div>
          )}

          {/* Event History */}
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-900">Event History</h4>
            <div className="space-y-2">
              {dispute.events.map((event) => (
                <div key={event.id} className="rounded border border-slate-200 bg-white p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">{event.actor?.name || "System"}</span>
                    <span className="text-slate-500">{formatDate(event.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-slate-600">
                    {event.fromState ? `${event.fromState} → ` : ""}{event.toState}: {event.note}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}