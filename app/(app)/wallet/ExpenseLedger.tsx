"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, EmptyState, ErrorNote } from "@/components/ui";
import {
  EXPENSE_CATEGORY_LABELS,
  SHARE_STATUS_LABELS,
  SPLIT_METHOD_LABELS,
  formatTaka,
  isExpenseDeletable,
  type WalletExpense,
} from "@/lib/wallet";
import type { ShareStatus } from "@prisma/client";

const STATUS_TONE: Record<ShareStatus, "green" | "amber" | "slate"> = {
  PAID: "green",
  PENDING: "amber",
  WAIVED: "slate",
};

const settleButtonClass =
  "rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium " +
  "text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-GB", { dateStyle: "medium" });
}

/**
 * The running ledger: every expense with each housemate's share and whether it
 * is settled.
 *
 * Everyone in the house sees every row. That is the point of the feature — a
 * shared wallet nobody can audit is just a private notebook.
 */
export function ExpenseLedger({
  expenses,
  currentUserId,
  canManage,
}: {
  expenses: WalletExpense[];
  currentUserId: string;
  /** House admin: may settle or waive anyone's share, not only their own. */
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function settle(shareId: string, status: ShareStatus) {
    setBusyId(shareId);
    setError(null);

    const response = await fetch("/api/expenses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareId, status }),
    });
    const body = await response.json();

    setBusyId(null);
    if (!response.ok) {
      setError(body.error ?? "Could not update that share");
      return;
    }
    router.refresh();
  }

  async function remove(expense: WalletExpense) {
    const confirmed = window.confirm(
      `Delete "${expense.title}" (${formatTaka(expense.amount)})? ` +
        "This removes it from everyone's ledger and cannot be undone."
    );
    if (!confirmed) return;

    setBusyId(expense.id);
    setError(null);

    const response = await fetch(`/api/expenses/${expense.id}`, { method: "DELETE" });
    const body = await response.json();

    setBusyId(null);
    if (!response.ok) {
      setError(body.error ?? "Could not delete that expense");
      return;
    }
    router.refresh();
  }

  if (expenses.length === 0) {
    return (
      <EmptyState
        title="No shared expenses yet"
        hint="Add the first bill above and it will split across the house straight away."
      />
    );
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {expenses.map((expense) => {
        const outstanding = expense.shares
          .filter((share) => share.status === "PENDING")
          .reduce((sum, share) => sum + share.amount, 0);

        return (
          <Card key={expense.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-medium text-slate-900">{expense.title}</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatDate(expense.spentOn)} ·{" "}
                  {expense.paidById ? (
                    <>
                      paid by{" "}
                      <span className="font-medium text-slate-600">
                        {expense.paidById === currentUserId ? "you" : expense.paidByName || "—"}
                      </span>
                      {expense.paidById === expense.createdById
                        ? ""
                        : `, logged by ${expense.createdByName || "—"}`}
                    </>
                  ) : (
                    <>charged to the house by {expense.createdByName || "—"}</>
                  )}{" "}
                  · {SPLIT_METHOD_LABELS[expense.splitMethod].toLowerCase()}
                </p>
                {expense.description ? (
                  <p className="mt-2 text-sm text-slate-600">{expense.description}</p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Badge tone="blue">{EXPENSE_CATEGORY_LABELS[expense.category]}</Badge>
                <span className="tabular text-lg font-semibold text-slate-900">
                  {formatTaka(expense.amount)}
                </span>
              </div>
            </div>

            <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
              {expense.shares.map((share) => {
                const isMine = share.userId === currentUserId;
                const busy = busyId === share.id;

                // Mirrors assertCanSettleShare exactly. The server is still the
                // authority — this only avoids offering a button that would be
                // refused. A waiver may only be reversed by the house admin who
                // could grant it, and a gateway-settled row is off limits to
                // everyone until the payment itself is refunded.
                const mayTouch =
                  !share.settledByPayment &&
                  (isMine || canManage) &&
                  (share.status !== "WAIVED" || canManage);

                return (
                  <li key={share.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1 text-sm text-slate-800">
                      <span className="truncate">
                        {share.userName || "Unnamed housemate"}
                        {isMine ? <span className="ml-1.5 text-xs text-slate-500">(you)</span> : null}
                        {share.userId === expense.paidById ? (
                          <span className="ml-1.5 text-xs text-slate-500">· paid upfront</span>
                        ) : null}
                      </span>
                      {/* Answers "who marked this paid, and when?" without
                          anyone having to take the other person's word. */}
                      {share.lastEvent ? (
                        <span className="block text-xs text-slate-400">
                          {share.lastEvent.note ?? "Updated"}
                          {share.lastEvent.actorName ? ` by ${share.lastEvent.actorName}` : ""} ·{" "}
                          {formatDate(share.lastEvent.at)}
                        </span>
                      ) : null}
                    </span>

                    <span className="tabular shrink-0 text-sm font-medium text-slate-900">
                      {formatTaka(share.amount)}
                    </span>

                    <Badge tone={STATUS_TONE[share.status]}>
                      {SHARE_STATUS_LABELS[share.status]}
                    </Badge>

                    <span className="flex shrink-0 items-center gap-1.5">
                      {share.settledByPayment ? (
                        <span className="text-xs text-slate-500">paid in app</span>
                      ) : null}

                      {share.status !== "PAID" && mayTouch ? (
                        <button
                          type="button"
                          className={settleButtonClass}
                          disabled={busy}
                          onClick={() => settle(share.id, "PAID")}
                        >
                          {busy ? "Saving…" : "Mark paid"}
                        </button>
                      ) : null}

                      {share.status !== "PENDING" && mayTouch ? (
                        <button
                          type="button"
                          className={settleButtonClass}
                          disabled={busy}
                          onClick={() => settle(share.id, "PENDING")}
                        >
                          Undo
                        </button>
                      ) : null}

                      {share.status === "PENDING" && canManage ? (
                        <button
                          type="button"
                          className={settleButtonClass}
                          disabled={busy}
                          onClick={() => settle(share.id, "WAIVED")}
                        >
                          Waive
                        </button>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                {outstanding > 0
                  ? `${formatTaka(outstanding)} still outstanding on this bill.`
                  : "Fully settled."}
              </p>

              {(expense.createdById === currentUserId || canManage) &&
              isExpenseDeletable(expense) ? (
                <button
                  type="button"
                  className={`${settleButtonClass} text-rose-700 hover:bg-rose-50`}
                  disabled={busyId === expense.id}
                  onClick={() => remove(expense)}
                >
                  {busyId === expense.id ? "Deleting…" : "Delete expense"}
                </button>
              ) : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
