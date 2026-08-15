"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Badge, Card, EmptyState, ErrorNote, buttonClass, secondaryButtonClass } from "@/components/ui";
import type { JoinRequestStatus } from "@prisma/client";

type BreakdownItem = { factor: string; label: string; score: number; weight: number; dealbreaker: boolean };
type Candidate = {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  contactUnlocked: boolean;
  verified: boolean;
  budgetMin: number;
  budgetMax: number;
  preferredArea: string | null;
  score: number;
  breakdown: BreakdownItem[];
  summary: string;
  request: { id: string; status: JoinRequestStatus; mine?: boolean } | null;
};

export function PeopleMatchList() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/matches/people");
    const body = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Could not load candidates");
      return;
    }
    setCandidates(body.candidates ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendRequest(receiverId: string) {
    setActing(receiverId);
    setError(null);
    const res = await fetch("/api/matches/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiver_id: receiverId }),
    });
    const body = await res.json();
    setActing(null);
    if (!res.ok) {
      setError(body.error ?? "Could not send request");
      return;
    }
    void load();
  }

  async function setStatus(requestId: string, status: "ACCEPTED" | "REJECTED" | "CANCELLED", key: string) {
    setActing(key);
    setError(null);
    const res = await fetch("/api/matches/people", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: requestId, status }),
    });
    const body = await res.json();
    setActing(null);
    if (!res.ok) {
      setError(body.error ?? "Request failed");
      return;
    }
    void load();
  }

  async function block(userId: string) {
    setActing(userId);
    setError(null);
    const res = await fetch("/api/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    const body = await res.json();
    setActing(null);
    if (!res.ok) {
      setError(body.error ?? "Could not block this user");
      return;
    }
    void load();
  }

  async function submitReport(userId: string) {
    if (!reportReason.trim()) return;
    setActing(userId);
    setError(null);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_type: "USER", target_id: userId, reason: reportReason.trim() }),
    });
    const body = await res.json();
    setActing(null);
    if (!res.ok) {
      setError(body.error ?? "Could not file the report");
      return;
    }
    setReporting(null);
    setReportReason("");
  }

  if (loading) return <p className="text-sm text-slate-500">Finding compatible people…</p>;

  return (
    <div className="space-y-4">
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {candidates.length === 0 ? (
        <EmptyState
          title="No candidates yet"
          hint="Once other residents set their preferences, they'll show up here ranked by compatibility."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {candidates.map((c) => {
            const isOpen = expanded === c.userId;
            const busy = acting === c.userId || acting === c.request?.id;
            return (
              <Card key={c.userId}>
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h2 className="flex items-center gap-1.5 font-medium text-slate-900">
                    {c.contactUnlocked ? c.name || "Resident" : "Hidden until you match"}
                    {c.verified ? <Badge tone="blue">Verified</Badge> : null}
                  </h2>
                  <Badge tone={c.score >= 0.8 ? "green" : "slate"}>{Math.round(c.score * 100)}% match</Badge>
                </div>
                <p className="text-sm text-slate-600">
                  BDT {c.budgetMin.toLocaleString()}–{c.budgetMax.toLocaleString()}/month
                  {c.preferredArea ? ` · ${c.preferredArea}` : ""}
                </p>
                {c.contactUnlocked && (c.email || c.phone) ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {c.phone ? c.phone : ""} {c.phone && c.email ? "·" : ""} {c.email ?? ""}
                  </p>
                ) : null}

                <button
                  type="button"
                  className="mt-3 text-left text-xs text-brand-700 underline"
                  onClick={() => setExpanded(isOpen ? null : c.userId)}
                >
                  {isOpen ? "Hide" : "Why this score?"}
                </button>
                {isOpen ? (
                  <div className="mt-2 space-y-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                    <p className="font-medium text-slate-700">{c.summary}</p>
                    {c.breakdown.map((item) => (
                      <div key={item.factor} className="flex items-center justify-between">
                        <span>
                          {item.label}
                          {item.dealbreaker ? <span className="ml-1 text-rose-600">(dealbreaker)</span> : null}
                        </span>
                        <span className="font-mono">{Math.round(item.score * 100)}%</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Link href={`/messages/${c.userId}`} className={secondaryButtonClass}>
                    Message
                  </Link>
                  {!c.request ? (
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={busy}
                      onClick={() => sendRequest(c.userId)}
                    >
                      Send request
                    </button>
                  ) : c.request.status === "PENDING" ? (
                    c.request.mine ? (
                      <div className="flex items-center gap-2">
                        <Badge tone="amber">Request sent</Badge>
                        <button
                          type="button"
                          className={secondaryButtonClass}
                          disabled={busy}
                          onClick={() => setStatus(c.request!.id, "CANCELLED", c.request!.id)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={buttonClass}
                          disabled={busy}
                          onClick={() => setStatus(c.request!.id, "ACCEPTED", c.request!.id)}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className={secondaryButtonClass}
                          disabled={busy}
                          onClick={() => setStatus(c.request!.id, "REJECTED", c.request!.id)}
                        >
                          Decline
                        </button>
                      </div>
                    )
                  ) : (
                    <Badge
                      tone={
                        c.request.status === "ACCEPTED"
                          ? "green"
                          : c.request.status === "REJECTED"
                            ? "red"
                            : "slate"
                      }
                    >
                      {c.request.status.toLowerCase()}
                    </Badge>
                  )}
                </div>

                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    className="text-xs text-slate-400 underline hover:text-rose-600"
                    disabled={busy}
                    onClick={() => block(c.userId)}
                  >
                    Block
                  </button>
                  <button
                    type="button"
                    className="text-xs text-slate-400 underline hover:text-rose-600"
                    onClick={() => setReporting(reporting === c.userId ? null : c.userId)}
                  >
                    Report
                  </button>
                </div>
                {reporting === c.userId ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      placeholder="Reason for the report"
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                    />
                    <button
                      type="button"
                      className="whitespace-nowrap rounded-lg bg-rose-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                      disabled={busy || !reportReason.trim()}
                      onClick={() => submitReport(c.userId)}
                    >
                      Submit
                    </button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
