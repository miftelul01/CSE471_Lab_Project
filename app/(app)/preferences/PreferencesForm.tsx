"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, ErrorNote, Field, SuccessNote, buttonClass, inputClass } from "@/components/ui";
import type { CleanlinessLevel, SleepSchedule } from "@prisma/client";

// budgetMin/budgetMax are Prisma Decimal in the database — plain numbers here
// because Decimal instances cannot cross the Server -> Client Component
// boundary (see app/(app)/preferences/page.tsx).
export type PreferenceValues = {
  budgetMin: number;
  budgetMax: number;
  sleepSchedule: SleepSchedule;
  cleanliness: CleanlinessLevel;
  smokingOk: boolean;
  petsOk: boolean;
  preferredArea: string | null;
};

const SLEEP_OPTIONS: { value: SleepSchedule; label: string }[] = [
  { value: "EARLY_BIRD", label: "Early bird — asleep before midnight" },
  { value: "NIGHT_OWL", label: "Night owl — up late" },
  { value: "FLEXIBLE", label: "Flexible — either works" },
];

const CLEAN_OPTIONS: { value: CleanlinessLevel; label: string }[] = [
  { value: "VERY_TIDY", label: "Very tidy — everything in its place" },
  { value: "MODERATE", label: "Moderate — tidy enough" },
  { value: "RELAXED", label: "Relaxed — lived-in is fine" },
];

export function PreferencesForm({ preference }: { preference: PreferenceValues | null }) {
  const router = useRouter();
  const [form, setForm] = useState({
    budgetMin: preference?.budgetMin?.toString() ?? "5000",
    budgetMax: preference?.budgetMax?.toString() ?? "15000",
    sleepSchedule: preference?.sleepSchedule ?? ("FLEXIBLE" as SleepSchedule),
    cleanliness: preference?.cleanliness ?? ("MODERATE" as CleanlinessLevel),
    smokingOk: preference?.smokingOk ?? false,
    petsOk: preference?.petsOk ?? false,
    preferredArea: preference?.preferredArea ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        budgetMin: Number(form.budgetMin),
        budgetMax: Number(form.budgetMax),
      }),
    });
    const body = await res.json();

    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Could not save your preferences");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum budget (BDT/month)">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.budgetMin}
              onChange={(e) => setForm({ ...form, budgetMin: e.target.value })}
              required
            />
          </Field>
          <Field label="Maximum budget (BDT/month)">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.budgetMax}
              onChange={(e) => setForm({ ...form, budgetMax: e.target.value })}
              required
            />
          </Field>
        </div>

        <Field label="Sleep schedule">
          <select
            className={inputClass}
            value={form.sleepSchedule}
            onChange={(e) => setForm({ ...form, sleepSchedule: e.target.value as SleepSchedule })}
          >
            {SLEEP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Cleanliness">
          <select
            className={inputClass}
            value={form.cleanliness}
            onChange={(e) => setForm({ ...form, cleanliness: e.target.value as CleanlinessLevel })}
          >
            {CLEAN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Preferred area" hint="Leave blank if you're open to anywhere.">
          <input
            className={inputClass}
            value={form.preferredArea}
            onChange={(e) => setForm({ ...form, preferredArea: e.target.value })}
            placeholder="Bashundhara"
          />
        </Field>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.smokingOk}
              onChange={(e) => setForm({ ...form, smokingOk: e.target.checked })}
            />
            Smoking is OK
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.petsOk}
              onChange={(e) => setForm({ ...form, petsOk: e.target.checked })}
            />
            Pets are OK
          </label>
        </div>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {saved ? (
          <SuccessNote>
            Saved.{" "}
            <Link href="/matches" className="underline">
              See your matches
            </Link>
            .
          </SuccessNote>
        ) : null}

        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Saving…" : "Save preferences"}
        </button>
      </form>
    </Card>
  );
}
