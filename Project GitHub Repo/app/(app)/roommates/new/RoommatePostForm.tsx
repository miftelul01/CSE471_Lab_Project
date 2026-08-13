"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, ErrorNote, Field, buttonClass, inputClass } from "@/components/ui";
import { CLEANLINESS_LEVELS, SLEEP_SCHEDULES } from "@/lib/listings";
import type { CleanlinessLevel, SleepSchedule } from "@prisma/client";

export function RoommatePostForm({
  houses,
}: {
  houses: { id: string; name: string; area: string | null }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    houseId: houses[0]?.id ?? "",
    title: "",
    description: "",
    monthlyShare: "",
    seatsAvailable: "1",
    availableFrom: "",
    sleepSchedule: "" as SleepSchedule | "",
    cleanliness: "" as CleanlinessLevel | "",
    smokingOk: false,
    petsOk: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const response = await fetch("/api/roommate-posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        monthlyShare: Number(form.monthlyShare),
        seatsAvailable: Number(form.seatsAvailable),
        availableFrom: form.availableFrom || null,
        sleepSchedule: form.sleepSchedule || null,
        cleanliness: form.cleanliness || null,
      }),
    });
    const body = await response.json();

    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Could not publish the post");
      return;
    }
    router.push("/roommates");
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Which flat">
          <select
            className={inputClass}
            value={form.houseId}
            onChange={(e) => setForm({ ...form, houseId: e.target.value })}
          >
            {houses.map((house) => (
              <option key={house.id} value={house.id}>
                {house.name}
                {house.area ? ` — ${house.area}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Headline">
          <input
            className={inputClass}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Spare seat in a quiet 3-person flat"
            required
          />
        </Field>

        <Field label="About the flat and who'd suit it">
          <textarea
            className={inputClass}
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Two of us are final-year students. Kitchen shared, quiet after 11pm…"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Monthly share (BDT)">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.monthlyShare}
              onChange={(e) => setForm({ ...form, monthlyShare: e.target.value })}
              required
            />
          </Field>
          <Field label="Seats free">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.seatsAvailable}
              onChange={(e) => setForm({ ...form, seatsAvailable: e.target.value })}
            />
          </Field>
          <Field label="Available from">
            <input
              type="date"
              className={inputClass}
              value={form.availableFrom}
              onChange={(e) => setForm({ ...form, availableFrom: e.target.value })}
            />
          </Field>
        </div>

        <fieldset className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium text-slate-700">Who would fit in</legend>
          <p className="text-xs text-slate-500 sm:col-span-2">
            Used to rank this flat for compatible people. Leave blank if you don&apos;t mind.
          </p>

          <Field label="Sleep schedule">
            <select
              className={inputClass}
              value={form.sleepSchedule}
              onChange={(e) =>
                setForm({ ...form, sleepSchedule: e.target.value as SleepSchedule | "" })
              }
            >
              <option value="">No preference</option>
              {SLEEP_SCHEDULES.map((v) => (
                <option key={v} value={v}>
                  {v.toLowerCase().replace("_", " ")}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Cleanliness">
            <select
              className={inputClass}
              value={form.cleanliness}
              onChange={(e) =>
                setForm({ ...form, cleanliness: e.target.value as CleanlinessLevel | "" })
              }
            >
              <option value="">No preference</option>
              {CLEANLINESS_LEVELS.map((v) => (
                <option key={v} value={v}>
                  {v.toLowerCase().replace("_", " ")}
                </option>
              ))}
            </select>
          </Field>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.smokingOk}
              onChange={(e) => setForm({ ...form, smokingOk: e.target.checked })}
            />
            Smoking is fine
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.petsOk}
              onChange={(e) => setForm({ ...form, petsOk: e.target.checked })}
            />
            Pets are fine
          </label>
        </fieldset>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Publishing…" : "Publish post"}
        </button>
      </form>
    </Card>
  );
}
