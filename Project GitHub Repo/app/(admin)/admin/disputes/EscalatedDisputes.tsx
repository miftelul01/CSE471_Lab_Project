"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { EscalatedDispute } from "./page";
import {
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  buttonClass,
  inputClass,
  secondaryButtonClass,
} from "@/components/ui";

export function EscalatedDisputes({
  disputes,
  loadError,
}: {
  disputes: EscalatedDispute[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, state: "RESOLVED" | "ARCHIVED") {
    setBusy(id);
    setError(null);

    const response = await fetch("/api/admin/disputes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, state, resolution: resolutions[id] ?? "" }),
    });
    const body = await response.json().catch(() => ({}));

    setBusy(null);
    if (!response.ok) {
      setError(body.error ?? "Could not update the dispute");
      return;
    }
    router.refresh();
  }

  if (loadError) return <ErrorNote>{loadError}</ErrorNote>;

  if (disputes.length === 0) {
    return (
      <EmptyState
        title="Nothing escalated"
        hint="Disputes arrive here when a house's vote fails to reach consensus, or when someone escalates one deliberately."
      />
    );
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {disputes.map((dispute) => {
        const votesFor = dispute.votes.filter((v: { vote: string }) => v.vote === "FOR").length;
        const votesAgainst = dispute.votes.filter((v: { vote: string }) => v.vote === "AGAINST").length;
        const abstained = dispute.votes.filter((v: { vote: string }) => v.vote === "ABSTAIN").length;

        return (
          <Card key={dispute.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-medium text-slate-900">{dispute.title}</h2>
                <p className="text-sm text-slate-500">
                  {dispute.house?.name ?? "Unknown house"}
                  {dispute.category ? ` · ${dispute.category}` : ""}
                  {dispute.escalatedAt
                    ? ` · escalated ${new Date(dispute.escalatedAt).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
              <Badge tone="red">Escalated</Badge>
            </div>

            {dispute.description ? (
              <p className="mt-3 whitespace-pre-line text-sm text-slate-700">
                {dispute.description}
              </p>
            ) : null}

            <div className="mt-3 flex gap-3 text-xs text-slate-500">
              <span>For: {votesFor}</span>
              <span>Against: {votesAgainst}</span>
              <span>Abstained: {abstained}</span>
            </div>

            <div className="mt-4 space-y-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Resolution note
                </span>
                <textarea
                  className={inputClass}
                  rows={2}
                  value={resolutions[dispute.id] ?? ""}
                  onChange={(e) =>
                    setResolutions({ ...resolutions, [dispute.id]: e.target.value })
                  }
                  placeholder="How this was settled — the house sees this."
                />
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy === dispute.id}
                  onClick={() => act(dispute.id, "RESOLVED")}
                >
                  {busy === dispute.id ? "Working…" : "Resolve"}
                </button>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={busy === dispute.id}
                  onClick={() => act(dispute.id, "ARCHIVED")}
                >
                  Archive without ruling
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Resolving requires a note. Archiving is final — the state machine allows nothing
                after ARCHIVED.
              </p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
