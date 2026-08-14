"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, ErrorNote } from "@/components/ui";
import type { DisputeState } from "@prisma/client";

type Complaint = {
  id: string;
  title: string;
  description: string;
  state: DisputeState;
  houseName: string;
  raisedByName: string;
  subject: { id: string; name: string; matchRatingPenalty: number } | null;
  resolution: string | null;
};

const STATE_TONE: Record<DisputeState, "amber" | "green" | "red" | "slate"> = {
  RAISED: "amber",
  VOTING: "amber",
  ESCALATED: "red",
  RESOLVED: "green",
  ARCHIVED: "slate",
};

export function ProfileComplaintsTable({ complaints }: { complaints: Complaint[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [resolutionDraft, setResolutionDraft] = useState<Record<string, string>>({});

  async function resolve(id: string, uphold: boolean) {
    const resolution = (resolutionDraft[id] ?? "").trim();
    if (!resolution) {
      setError("Add a short resolution note before deciding.");
      return;
    }
    setBusy(id);
    setError(null);
    const res = await fetch("/api/admin/disputes/uphold", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, uphold, resolution }),
    });
    const body = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Could not resolve the complaint");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {complaints.map((c) => {
        const isOpen = c.state !== "RESOLVED" && c.state !== "ARCHIVED";
        return (
          <Card key={c.id}>
            <div className="mb-1 flex items-start justify-between gap-2">
              <h3 className="font-medium text-slate-900">{c.title}</h3>
              <Badge tone={STATE_TONE[c.state]}>{c.state.toLowerCase()}</Badge>
            </div>
            <p className="text-xs text-slate-500">
              {c.houseName} · filed by {c.raisedByName} against{" "}
              {c.subject ? c.subject.name : "a former resident"}
              {c.subject ? ` (current penalty: ${c.subject.matchRatingPenalty})` : ""}
            </p>
            <p className="mt-2 text-sm text-slate-700">{c.description}</p>

            {c.resolution ? (
              <p className="mt-2 text-sm text-slate-600">
                <span className="font-medium">Resolution:</span> {c.resolution}
              </p>
            ) : isOpen ? (
              <div className="mt-3 space-y-2">
                <textarea
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  rows={2}
                  placeholder="Resolution note (shown to both residents)"
                  value={resolutionDraft[c.id] ?? ""}
                  onChange={(e) => setResolutionDraft({ ...resolutionDraft, [c.id]: e.target.value })}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-card transition hover:bg-rose-700 disabled:opacity-50"
                    disabled={busy === c.id || !c.subject}
                    onClick={() => resolve(c.id, true)}
                  >
                    Uphold (+10 penalty)
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-card transition hover:bg-slate-50 disabled:opacity-50"
                    disabled={busy === c.id}
                    onClick={() => resolve(c.id, false)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
