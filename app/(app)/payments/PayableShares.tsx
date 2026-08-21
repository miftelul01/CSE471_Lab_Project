"use client";

import { useState } from "react";

import { Badge, Card, ErrorNote, buttonClass } from "@/components/ui";
import { formatTaka } from "@/lib/wallet";

type PayableShare = {
  id: string;
  title: string;
  category: string | null;
  amount: number;
  spentOn: string;
  hasPendingAttempt: boolean;
};

/**
 * M3.2 — the "pay this" list.
 *
 * Note what is NOT sent: no amount. The request carries the share id alone and
 * the server reads what is owed from the ledger row, so a tampered request body
 * cannot settle a 20,000 BDT bill for 1 BDT.
 */
export function PayableShares({ shares }: { shares: PayableShare[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pay(shareId: string) {
    setBusyId(shareId);
    setError(null);

    const response = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expenseShareId: shareId }),
    });
    const body = await response.json();

    if (!response.ok) {
      setBusyId(null);
      setError(body.error ?? "Could not start that payment");
      return;
    }

    // Full navigation rather than router.push: with a live key this is an
    // off-site Stripe URL, and the sandbox stands in for exactly that.
    window.location.href = body.redirectUrl;
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {shares.map((share) => (
        <Card key={share.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium text-slate-900">{share.title}</h3>
                {share.category ? <Badge>{share.category}</Badge> : null}
                {share.hasPendingAttempt ? <Badge tone="amber">Attempt in progress</Badge> : null}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Spent on{" "}
                {new Date(share.spentOn).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="tabular text-lg font-semibold text-slate-900">
                {formatTaka(share.amount)}
              </span>
              <button
                type="button"
                className={buttonClass}
                disabled={busyId === share.id}
                onClick={() => pay(share.id)}
              >
                {busyId === share.id ? "Starting…" : "Pay"}
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
