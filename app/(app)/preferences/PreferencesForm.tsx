"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, ErrorNote, Field, SuccessNote, buttonClass, inputClass } from "@/components/ui";
import type { GuestPolicy, PreferenceWeight, SleepSchedule } from "@prisma/client";

// budgetMin/budgetMax are Prisma Decimal in the database — plain numbers here
// because Decimal instances cannot cross the Server -> Client Component
// boundary (see app/(app)/preferences/page.tsx).
export type PreferenceValues = {
  budgetMin: number;
  budgetMax: number;
  sleepSchedule: SleepSchedule;
  cleanlinessLevel: number;
  noiseTolerance: number;
  guestPolicy: GuestPolicy;
  smokingOk: boolean;
  petsOk: boolean;
  preferredArea: string | null;
  budgetWeight: PreferenceWeight;
  sleepWeight: PreferenceWeight;
  cleanlinessWeight: PreferenceWeight;
  noiseWeight: PreferenceWeight;
  guestWeight: PreferenceWeight;
  smokingWeight: PreferenceWeight;
  petsWeight: PreferenceWeight;
};

const SLEEP_OPTIONS: { value: SleepSchedule; label: string }[] = [
  { value: "EARLY_BIRD", label: "Early bird — asleep before midnight" },
  { value: "NIGHT_OWL", label: "Night owl — up late" },
  { value: "FLEXIBLE", label: "Flexible — either works" },
];

const GUEST_OPTIONS: { value: GuestPolicy; label: string }[] = [
  { value: "RARELY", label: "Rarely — I like a quiet, private house" },
  { value: "OCCASIONALLY", label: "Occasionally — the odd visitor is fine" },
  { value: "FREQUENTLY", label: "Frequently — I like a lively, social house" },
];

const WEIGHT_OPTIONS: { value: PreferenceWeight; label: string }[] = [
  { value: "MUST_HAVE", label: "Must-have (dealbreaker)" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

/** A weighted factor row: the input on the left, "how much this matters" on the right. */
function WeightedField({
  label,
  hint,
  weight,
  onWeightChange,
  children,
}: {
  label: string;
  hint?: string;
  weight: PreferenceWeight;
  onWeightChange: (w: PreferenceWeight) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-slate-100 p-3 sm:grid-cols-[1fr_180px]">
      <Field label={label} hint={hint}>
        {children}
      </Field>
      <Field label="Importance">
        <select
          className={inputClass}
          value={weight}
          onChange={(e) => onWeightChange(e.target.value as PreferenceWeight)}
        >
          {WEIGHT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

export function PreferencesForm({ preference }: { preference: PreferenceValues | null }) {
  const router = useRouter();
  const [form, setForm] = useState({
    budgetMin: preference?.budgetMin?.toString() ?? "5000",
    budgetMax: preference?.budgetMax?.toString() ?? "15000",
    sleepSchedule: preference?.sleepSchedule ?? ("FLEXIBLE" as SleepSchedule),
    cleanlinessLevel: preference?.cleanlinessLevel ?? 3,
    noiseTolerance: preference?.noiseTolerance ?? 3,
    guestPolicy: preference?.guestPolicy ?? ("OCCASIONALLY" as GuestPolicy),
    smokingOk: preference?.smokingOk ?? false,
    petsOk: preference?.petsOk ?? false,
    preferredArea: preference?.preferredArea ?? "",
    budgetWeight: preference?.budgetWeight ?? ("MEDIUM" as PreferenceWeight),
    sleepWeight: preference?.sleepWeight ?? ("MEDIUM" as PreferenceWeight),
    cleanlinessWeight: preference?.cleanlinessWeight ?? ("MEDIUM" as PreferenceWeight),
    noiseWeight: preference?.noiseWeight ?? ("MEDIUM" as PreferenceWeight),
    guestWeight: preference?.guestWeight ?? ("MEDIUM" as PreferenceWeight),
    smokingWeight: preference?.smokingWeight ?? ("MEDIUM" as PreferenceWeight),
    petsWeight: preference?.petsWeight ?? ("MEDIUM" as PreferenceWeight),
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
        cleanlinessLevel: Number(form.cleanlinessLevel),
        noiseTolerance: Number(form.noiseTolerance),
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
        <p className="text-xs text-slate-500">
          Set &ldquo;Importance&rdquo; to <strong>Must-have</strong> for anything you consider a
          dealbreaker — a hard mismatch there caps the whole compatibility score low, instead of
          just averaging it away.
        </p>

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
        <div className="-mt-2">
          <Field label="How much budget matters">
            <select
              className={inputClass}
              value={form.budgetWeight}
              onChange={(e) => setForm({ ...form, budgetWeight: e.target.value as PreferenceWeight })}
            >
              {WEIGHT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <WeightedField
          label="Sleep schedule"
          weight={form.sleepWeight}
          onWeightChange={(w) => setForm({ ...form, sleepWeight: w })}
        >
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
        </WeightedField>

        <WeightedField
          label={`Cleanliness — ${form.cleanlinessLevel}/5`}
          hint="1 = relaxed, lived-in is fine. 5 = very tidy, everything in its place."
          weight={form.cleanlinessWeight}
          onWeightChange={(w) => setForm({ ...form, cleanlinessWeight: w })}
        >
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            className="w-full"
            value={form.cleanlinessLevel}
            onChange={(e) => setForm({ ...form, cleanlinessLevel: Number(e.target.value) })}
          />
        </WeightedField>

        <WeightedField
          label={`Noise tolerance — ${form.noiseTolerance}/5`}
          hint="1 = I need it quiet. 5 = I don't mind a lot of noise."
          weight={form.noiseWeight}
          onWeightChange={(w) => setForm({ ...form, noiseWeight: w })}
        >
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            className="w-full"
            value={form.noiseTolerance}
            onChange={(e) => setForm({ ...form, noiseTolerance: Number(e.target.value) })}
          />
        </WeightedField>

        <WeightedField
          label="Guest / visitor policy"
          weight={form.guestWeight}
          onWeightChange={(w) => setForm({ ...form, guestWeight: w })}
        >
          <select
            className={inputClass}
            value={form.guestPolicy}
            onChange={(e) => setForm({ ...form, guestPolicy: e.target.value as GuestPolicy })}
          >
            {GUEST_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </WeightedField>

        <Field label="Preferred area" hint="Leave blank if you're open to anywhere.">
          <input
            className={inputClass}
            value={form.preferredArea}
            onChange={(e) => setForm({ ...form, preferredArea: e.target.value })}
            placeholder="Bashundhara"
          />
        </Field>

        <WeightedField
          label="Smoking"
          weight={form.smokingWeight}
          onWeightChange={(w) => setForm({ ...form, smokingWeight: w })}
        >
          <label className="flex h-[38px] items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.smokingOk}
              onChange={(e) => setForm({ ...form, smokingOk: e.target.checked })}
            />
            Smoking is OK
          </label>
        </WeightedField>

        <WeightedField
          label="Pets"
          weight={form.petsWeight}
          onWeightChange={(w) => setForm({ ...form, petsWeight: w })}
        >
          <label className="flex h-[38px] items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.petsOk}
              onChange={(e) => setForm({ ...form, petsOk: e.target.checked })}
            />
            Pets are OK
          </label>
        </WeightedField>

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
