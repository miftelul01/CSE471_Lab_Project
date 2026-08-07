"use client";

import { useEffect, useState } from "react";
import { useCurrentUserId } from "@/lib/useCurrentUserId";
import { UserIdBanner } from "@/components/UserIdBanner";

const SLEEP_OPTIONS = ["EARLY_BIRD", "NIGHT_OWL", "FLEXIBLE"];
const CLEAN_OPTIONS = ["VERY_TIDY", "MODERATE", "RELAXED"];

export default function PreferencesPage() {
  const { userId } = useCurrentUserId();
  const [budgetMin, setBudgetMin] = useState(5000);
  const [budgetMax, setBudgetMax] = useState(15000);
  const [sleepSchedule, setSleepSchedule] = useState("FLEXIBLE");
  const [cleanliness, setCleanliness] = useState("MODERATE");
  const [smokingOk, setSmokingOk] = useState(false);
  const [petsOk, setPetsOk] = useState(false);
  const [preferredArea, setPreferredArea] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/preferences?userId=${userId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setBudgetMin(data.budgetMin);
        setBudgetMax(data.budgetMax);
        setSleepSchedule(data.sleepSchedule);
        setCleanliness(data.cleanliness);
        setSmokingOk(data.smokingOk);
        setPetsOk(data.petsOk);
        setPreferredArea(data.preferredArea ?? "");
      });
  }, [userId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setStatus("saving");
    const res = await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        budgetMin,
        budgetMax,
        sleepSchedule,
        cleanliness,
        smokingOk,
        petsOk,
        preferredArea: preferredArea || null,
      }),
    });
    setStatus(res.ok ? "saved" : "error");
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">My Lifestyle Preferences</h1>
      <UserIdBanner />

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div className="flex gap-4">
          <label className="flex-1 text-sm">
            Budget min
            <input
              type="number"
              className="mt-1 w-full rounded border px-2 py-1"
              value={budgetMin}
              onChange={(e) => setBudgetMin(Number(e.target.value))}
            />
          </label>
          <label className="flex-1 text-sm">
            Budget max
            <input
              type="number"
              className="mt-1 w-full rounded border px-2 py-1"
              value={budgetMax}
              onChange={(e) => setBudgetMax(Number(e.target.value))}
            />
          </label>
        </div>

        <label className="block text-sm">
          Sleep schedule
          <select
            className="mt-1 w-full rounded border px-2 py-1"
            value={sleepSchedule}
            onChange={(e) => setSleepSchedule(e.target.value)}
          >
            {SLEEP_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          Cleanliness
          <select
            className="mt-1 w-full rounded border px-2 py-1"
            value={cleanliness}
            onChange={(e) => setCleanliness(e.target.value)}
          >
            {CLEAN_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          Preferred area (optional)
          <input
            className="mt-1 w-full rounded border px-2 py-1"
            value={preferredArea}
            onChange={(e) => setPreferredArea(e.target.value)}
            placeholder="e.g. Dhanmondi"
          />
        </label>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={smokingOk} onChange={(e) => setSmokingOk(e.target.checked)} />
            Smoking OK
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={petsOk} onChange={(e) => setPetsOk(e.target.checked)} />
            Pets OK
          </label>
        </div>

        <button
          type="submit"
          disabled={!userId || status === "saving"}
          className="rounded bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-50"
        >
          {status === "saving" ? "Saving..." : "Save Preferences"}
        </button>
        {status === "saved" && <p className="text-green-600 text-sm">Saved.</p>}
        {status === "error" && <p className="text-red-600 text-sm">Something went wrong.</p>}
      </form>
    </div>
  );
}
