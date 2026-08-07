"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, ErrorNote, Field, SuccessNote, buttonClass, inputClass } from "@/components/ui";
import type { CleanlinessLevel, Preference, SleepSchedule } from "@/lib/supabase/types";

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

export function PreferencesForm({ preference }: { preference: Preference | null }) {
  const router = useRouter();
  const [form, setForm] = useState({
    budget_min: preference?.budget_min?.toString() ?? "5000",
    budget_max: preference?.budget_max?.toString() ?? "15000",
    sleep_schedule: preference?.sleep_schedule ?? ("FLEXIBLE" as SleepSchedule),
    cleanliness: preference?.cleanliness ?? ("MODERATE" as CleanlinessLevel),
    smoking_ok: preference?.smoking_ok ?? false,
    pets_ok: preference?.pets_ok ?? false,
    preferred_area: preference?.preferred_area ?? "",
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
        budget_min: Number(form.budget_min),
        budget_max: Number(form.budget_max),
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
              value={form.budget_min}
              onChange={(e) => setForm({ ...form, budget_min: e.target.value })}
              required
            />
          </Field>
          <Field label="Maximum budget (BDT/month)">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.budget_max}
              onChange={(e) => setForm({ ...form, budget_max: e.target.value })}
              required
            />
          </Field>
        </div>

        <Field label="Sleep schedule">
          <select
            className={inputClass}
            value={form.sleep_schedule}
            onChange={(e) => setForm({ ...form, sleep_schedule: e.target.value as SleepSchedule })}
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
            value={form.preferred_area}
            onChange={(e) => setForm({ ...form, preferred_area: e.target.value })}
            placeholder="Bashundhara"
          />
        </Field>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.smoking_ok}
              onChange={(e) => setForm({ ...form, smoking_ok: e.target.checked })}
            />
            Smoking is OK
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.pets_ok}
              onChange={(e) => setForm({ ...form, pets_ok: e.target.checked })}
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
