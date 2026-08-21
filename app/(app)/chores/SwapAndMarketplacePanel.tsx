"use client";

import { useEffect, useState } from "react";

import { Badge, Card, EmptyState, secondaryButtonClass } from "@/components/ui";

type Assignment = { id: string; dueDate: string; userId: string; chore: { name: string } };

type SwapRequest = {
  id: string;
  status: string;
  proposerUserId: string;
  targetUserId: string;
  proposer: { id: string; name: string | null };
  target: { id: string; name: string | null };
  proposerAssignment: { chore: { name: string }; dueDate: string };
  targetAssignment: { chore: { name: string }; dueDate: string };
};

type MarketplacePost = {
  id: string;
  status: string;
  postedByUserId: string;
  assignmentId: string;
  postedBy: { id: string; name: string | null };
  assignment: { chore: { name: string }; dueDate: string };
};

/**
 * M3.4 — direct swaps (spec requirement 3) and the marketplace enhancement
 * (a shared claim pool for when there's no specific willing swap partner).
 */
export function SwapAndMarketplacePanel({ myUserId, myAssignments }: { myUserId: string; myAssignments: Assignment[] }) {
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [posts, setPosts] = useState<MarketplacePost[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    const [swapsRes, postsRes] = await Promise.all([
      fetch("/api/chores/swaps").then((r) => r.json()),
      fetch("/api/chores/marketplace").then((r) => r.json()),
    ]);
    setSwaps(swapsRes.requests ?? []);
    setPosts(postsRes.posts ?? []);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function respondSwap(id: string, status: "ACCEPTED" | "REJECTED" | "CANCELLED") {
    setBusyId(id);
    await fetch(`/api/chores/swaps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    void refresh();
  }

  async function postToMarketplace(assignmentId: string) {
    setBusyId(assignmentId);
    await fetch("/api/chores/marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId }),
    });
    setBusyId(null);
    void refresh();
  }

  async function marketplaceAction(id: string, action: "claim" | "cancel") {
    setBusyId(id);
    await fetch(`/api/chores/marketplace/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusyId(null);
    void refresh();
  }

  const pendingSwaps = swaps.filter((s) => s.status === "PENDING");
  const openPosts = posts.filter((p) => p.status === "OPEN");
  const alreadyPostedAssignmentIds = new Set(
    openPosts.filter((p) => p.postedByUserId === myUserId).map((p) => p.assignmentId)
  );

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Swap requests</h2>
        {pendingSwaps.length === 0 ? (
          <p className="text-xs text-slate-500">No open swap proposals.</p>
        ) : (
          <ul className="space-y-2">
            {pendingSwaps.map((s) => {
              const isTarget = s.targetUserId === myUserId;
              const isProposer = s.proposerUserId === myUserId;
              return (
                <li key={s.id} className="rounded-lg border border-slate-200 p-2 text-sm">
                  <p>
                    {isProposer ? "You" : s.proposer.name ?? "Someone"} offered{" "}
                    <span className="font-medium">{s.proposerAssignment.chore.name}</span> for{" "}
                    {isTarget ? "your" : `${s.target.name ?? "their"}`}{" "}
                    <span className="font-medium">{s.targetAssignment.chore.name}</span>
                  </p>
                  <div className="mt-1 flex gap-2">
                    {isTarget ? (
                      <>
                        <button
                          type="button"
                          className={secondaryButtonClass}
                          onClick={() => respondSwap(s.id, "ACCEPTED")}
                          disabled={busyId === s.id}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="text-xs text-slate-500"
                          onClick={() => respondSwap(s.id, "REJECTED")}
                          disabled={busyId === s.id}
                        >
                          Decline
                        </button>
                      </>
                    ) : null}
                    {isProposer ? (
                      <button
                        type="button"
                        className="text-xs text-slate-500"
                        onClick={() => respondSwap(s.id, "CANCELLED")}
                        disabled={busyId === s.id}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Chore marketplace</h2>
        <p className="mb-2 text-xs text-slate-500">
          Post one of your chores here for anyone else in the house to claim — no need to find a
          specific person to trade with.
        </p>

        {myAssignments.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {myAssignments
              .filter((a) => !alreadyPostedAssignmentIds.has(a.id))
              .map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => postToMarketplace(a.id)}
                  disabled={busyId === a.id}
                >
                  Post &ldquo;{a.chore.name}&rdquo;
                </button>
              ))}
          </div>
        ) : null}

        {openPosts.length === 0 ? (
          <EmptyState title="Nothing posted right now" />
        ) : (
          <ul className="space-y-2">
            {openPosts.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-sm">
                <span>
                  <span className="font-medium">{p.assignment.chore.name}</span> — posted by{" "}
                  {p.postedByUserId === myUserId ? "you" : p.postedBy.name ?? "someone"}
                  {p.postedByUserId === myUserId ? <Badge tone="slate">Your post</Badge> : null}
                </span>
                {p.postedByUserId === myUserId ? (
                  <button
                    type="button"
                    className="text-xs text-slate-500"
                    onClick={() => marketplaceAction(p.id, "cancel")}
                    disabled={busyId === p.id}
                  >
                    Withdraw
                  </button>
                ) : (
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => marketplaceAction(p.id, "claim")}
                    disabled={busyId === p.id}
                  >
                    Claim
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
