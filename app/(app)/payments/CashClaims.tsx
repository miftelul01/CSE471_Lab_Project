"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, ErrorNote, buttonClass, secondaryButtonClass } from "@/components/ui";
import { formatTaka } from "@/lib/wallet";

export type CashClaim = {
  id: string;
  amount: number;
  claimedAt: string;
  payerName: string;
  expenseTitle: string;
};

/**
 * M3.2 — cash handovers waiting on this resident's word.
 *
 * Only ever rendered to someone entitled to rule on the claim, and the API
 * re-checks that on every call — a list is a convenience, never the rule.
 * Confirming is what moves the payment to SUCCEEDED and lets the ledger
 * trigger mark the share paid; rejecting closes the claim so the housemate can
 * try a different method.
 */
export function CashClaims({ claims }: { claims: CashClaim[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(paymentId: string, outcome: "SUCCEEDED" | "FAILED") {
    setBusyId(paymentId);
    setError(null);

    const response = await fetch("/api/payments/cash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, outcome }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setBusyId(null);
      setError(body.error ?? "Could not record that decision");
      return;
    }

    setBusyId(null);
    router.refresh();
  }

  if (claims.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Cash waiting on you</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          You paid these bills, so you are the one who can say the money arrived.
        </p>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {claims.map((claim) => (
        <Card key={claim.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-slate-900">
                <span className="font-medium">{claim.payerName}</span> says they paid you{" "}
                <span className="tabular font-semibold">{formatTaka(claim.amount)}</span> in cash
                for <span className="font-medium">{claim.expenseTitle}</span>.
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Recorded{" "}
                {new Date(claim.claimedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={busyId === claim.id}
                onClick={() => decide(claim.id, "FAILED")}
              >
                Didn&apos;t get it
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={busyId === claim.id}
                onClick={() => decide(claim.id, "SUCCEEDED")}
              >
                {busyId === claim.id ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
