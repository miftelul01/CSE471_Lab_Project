"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Card, ErrorNote, Field, buttonClass, inputClass } from "@/components/ui";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  SPLIT_METHODS,
  SPLIT_METHOD_HINTS,
  SPLIT_METHOD_LABELS,
  buildSplit,
  dhakaTodayISO,
  formatTaka,
  paisaToTaka,
  toPaisa,
} from "@/lib/wallet";
import type { ExpenseCategory, SplitMethod } from "@prisma/client";

type Member = { id: string; name: string };

/**
 * Add-expense form for M2.1.
 *
 * The preview underneath the fields is produced by buildSplit — the very
 * function the API uses to write the shares. Reimplementing the arithmetic for
 * display would eventually drift from what actually gets stored, and the one
 * thing a bill-splitter cannot afford is showing a number it didn't save.
 */
export function AddExpenseForm({
  members,
  currentUserId,
}: {
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();

  const [form, setForm] = useState({
    title: "",
    description: "",
    amount: "",
    category: "OTHER" as ExpenseCategory,
    splitMethod: "EQUAL" as SplitMethod,
    spentOn: dhakaTodayISO(),
    paidById: currentUserId,
  });

  // Kept apart because the two mean different things: taka in one, a weight in
  // the other. Sharing one box would silently reinterpret whatever was typed
  // when the method changes.
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [weights, setWeights] = useState<Record<string, string>>({});

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const allocations = form.splitMethod === "CUSTOM" ? customAmounts : weights;

  const preview = useMemo(() => {
    const totalPaisa = toPaisa(form.amount);
    if (totalPaisa === null) return null;
    return buildSplit({ method: form.splitMethod, totalPaisa, memberIds, allocations });
  }, [form.amount, form.splitMethod, memberIds, allocations]);

  const previewByUser = useMemo(() => {
    if (!preview || "error" in preview) return null;
    return new Map(preview.shares.map((s) => [s.userId, paisaToTaka(s.paisa)]));
  }, [preview]);

  function setAllocation(userId: string, value: string) {
    const update = (prev: Record<string, string>) => ({ ...prev, [userId]: value });
    if (form.splitMethod === "CUSTOM") setCustomAmounts(update);
    else setWeights(update);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const response = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description || null,
        amount: form.amount,
        category: form.category,
        splitMethod: form.splitMethod,
        spentOn: form.spentOn,
        paidById: form.paidById,
        ...(form.splitMethod === "EQUAL" ? {} : { allocations }),
      }),
    });
    const body = await response.json();

    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Could not add the expense");
      return;
    }

    setForm({ ...form, title: "", description: "", amount: "" });
    setCustomAmounts({});
    setWeights({});
    router.refresh();
  }

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-slate-900">Add a shared expense</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="What was it for">
          <input
            className={inputClass}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="August electricity bill"
            maxLength={MAX_TITLE_LENGTH}
            required
          />
        </Field>

        <Field label="Notes" hint="Optional — meter readings, who the shop was, anything worth remembering.">
          <textarea
            className={inputClass}
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            maxLength={MAX_DESCRIPTION_LENGTH}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Amount (৳)">
            <input
              type="number"
              min="0.01"
              step="0.01"
              className={inputClass}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="3200.00"
              required
            />
          </Field>

          <Field label="Category">
            <select
              className={inputClass}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
            >
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {EXPENSE_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Date spent">
            <input
              type="date"
              className={inputClass}
              value={form.spentOn}
              onChange={(e) => setForm({ ...form, spentOn: e.target.value })}
              max={dhakaTodayISO()}
              required
            />
          </Field>
        </div>

        <Field
          label="Who paid"
          hint="Whoever put the money down. The rest of the house reimburses them, and their own share is marked paid straight away."
        >
          <select
            className={inputClass}
            value={form.paidById}
            onChange={(e) => setForm({ ...form, paidById: e.target.value })}
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name || "Unnamed housemate"}
                {member.id === currentUserId ? " (you)" : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="How should it split" hint={SPLIT_METHOD_HINTS[form.splitMethod]}>
          <select
            className={inputClass}
            value={form.splitMethod}
            onChange={(e) => setForm({ ...form, splitMethod: e.target.value as SplitMethod })}
          >
            {SPLIT_METHODS.map((method) => (
              <option key={method} value={method}>
                {SPLIT_METHOD_LABELS[method]}
              </option>
            ))}
          </select>
        </Field>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-sm font-medium text-slate-700">
              {form.splitMethod === "EQUAL" ? "Each person pays" : "Who pays what"}
            </p>
            <p className="text-xs text-slate-500">
              {members.length} housemate{members.length === 1 ? "" : "s"}
            </p>
          </div>

          <ul className="divide-y divide-slate-200">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm text-slate-800">
                  {member.name || "Unnamed housemate"}
                </span>

                <span className="flex shrink-0 items-center gap-3">
                  {form.splitMethod === "EQUAL" ? null : (
                    <input
                      type="number"
                      min="0"
                      step={form.splitMethod === "CUSTOM" ? "0.01" : "1"}
                      className={`${inputClass} w-28`}
                      value={allocations[member.id] ?? ""}
                      onChange={(e) => setAllocation(member.id, e.target.value)}
                      placeholder={form.splitMethod === "CUSTOM" ? "0.00" : "1"}
                      aria-label={
                        form.splitMethod === "CUSTOM"
                          ? `Amount for ${member.name}`
                          : `Ratio for ${member.name}`
                      }
                    />
                  )}

                  <span className="tabular w-28 text-right text-sm font-medium text-slate-900">
                    {previewByUser ? formatTaka(previewByUser.get(member.id) ?? 0) : "—"}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {preview && "error" in preview ? (
            <p className="mt-3 text-sm text-amber-700">{preview.error}</p>
          ) : null}
        </div>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <button
          type="submit"
          className={buttonClass}
          disabled={busy || members.length === 0 || Boolean(preview && "error" in preview)}
        >
          {busy ? "Adding…" : "Add expense"}
        </button>
      </form>
    </Card>
  );
}
