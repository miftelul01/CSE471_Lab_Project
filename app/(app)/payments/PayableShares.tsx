"use client";

import { useState } from "react";

import { Badge, Card, ErrorNote, buttonClass, secondaryButtonClass } from "@/components/ui";
import type { MethodOption } from "@/lib/payments";
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
 * Note what is NOT sent: no amount. The request carries the share id and a
 * method name, and the server reads what is owed from the ledger row, so a
 * tampered request body cannot settle a 20,000 BDT bill for 1 BDT. The method
 * is re-checked server-side too — this list is a convenience, not the rule.
 */
export function PayableShares({
  shares,
  methods,
}: {
  shares: PayableShare[];
  methods: MethodOption[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function pay(shareId: string, method: string) {
    setBusyId(shareId);
    setError(null);
    setNotice(null);

    const response = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expenseShareId: shareId, method }),
    });
    const body = await response.json();

    if (!response.ok) {
      setBusyId(null);
      setError(body.error ?? "Could not start that payment");
      return;
    }

    // Cash has nowhere to send anyone: it is a claim, and it sits until the
    // person who paid the bill confirms it. Say so rather than leaving the
    // resident on a page that looks like nothing happened.
    if (body.awaitingConfirmation) {
      setBusyId(null);
      setOpenId(null);
      setNotice(
        "Cash payment recorded. It settles once whoever paid the bill confirms they got it."
      );
      return;
    }

    // Full navigation rather than router.push: this is an off-site bKash or
    // Stripe URL, and the sandbox stands in for exactly that.
    window.location.href = body.redirectUrl;
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {notice ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>
      ) : null}

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
                className={openId === share.id ? secondaryButtonClass : buttonClass}
                disabled={busyId === share.id}
                onClick={() => setOpenId(openId === share.id ? null : share.id)}
              >
                {busyId === share.id ? "Starting…" : openId === share.id ? "Cancel" : "Pay"}
              </button>
            </div>
          </div>

          {openId === share.id ? (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <p className="text-sm font-medium text-slate-900">How would you like to pay?</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {methods.map((option) => (
                  <button
                    key={option.method}
                    type="button"
                    disabled={busyId === share.id}
                    onClick={() => pay(share.id, option.method)}
                    className="rounded-lg border border-slate-200 px-3 py-2.5 text-left transition hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    <span className="block text-sm font-medium text-slate-900">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{option.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
