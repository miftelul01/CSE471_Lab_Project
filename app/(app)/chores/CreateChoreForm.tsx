"use client";

import { useState } from "react";

import { Card, ErrorNote, Field, buttonClass, inputClass } from "@/components/ui";
import type { ChoreFrequency } from "@prisma/client";

const FREQUENCIES: { value: ChoreFrequency; label: string }[] = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Every 2 weeks" },
  { value: "MONTHLY", label: "Monthly" },
];

export function CreateChoreForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<ChoreFrequency>("WEEKLY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/chores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || undefined, frequency }),
    });
    const body = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(body.error ?? "Could not create the chore");
      return;
    }
    setName("");
    setDescription("");
    setOpen(false);
    onCreated();
  }

  if (!open) {
    return (
      <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
        + New chore
      </button>
    );
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Chore name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Wash the dishes"
            required
          />
        </Field>
        <Field label="Description" hint="Optional">
          <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Frequency">
          <select
            className={inputClass}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as ChoreFrequency)}
          >
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-xs text-slate-500">
          Rotates through every active resident of this house, in the order they joined.
        </p>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <div className="flex gap-2">
          <button type="submit" className={buttonClass} disabled={busy}>
            {busy ? "Creating…" : "Create chore"}
          </button>
          <button type="button" className="text-sm text-slate-500" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
