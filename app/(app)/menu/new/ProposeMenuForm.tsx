"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, ErrorNote, Field, buttonClass, inputClass } from "@/components/ui";
import { DAY_LABELS, MEAL_TYPES, MEAL_TYPE_LABELS, mondayOf } from "@/lib/menu";
import type { MealType } from "@prisma/client";

function defaultWeekStart(): string {
  const thisMonday = mondayOf(new Date());
  const nextMonday = new Date(thisMonday);
  nextMonday.setUTCDate(thisMonday.getUTCDate() + 7);
  return nextMonday.toISOString().slice(0, 10);
}

export function ProposeMenuForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [weekStartDate, setWeekStartDate] = useState(defaultWeekStart());
  // grid[dayOfWeek][mealType] -> description
  const [grid, setGrid] = useState<Record<number, Partial<Record<MealType, string>>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setCell(dayOfWeek: number, mealType: MealType, value: string) {
    setGrid((prev) => ({
      ...prev,
      [dayOfWeek]: { ...prev[dayOfWeek], [mealType]: value },
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const items = Object.entries(grid).flatMap(([dayOfWeek, meals]) =>
      Object.entries(meals)
        .filter(([, description]) => description && description.trim().length > 0)
        .map(([mealType, description]) => ({
          dayOfWeek: Number(dayOfWeek),
          mealType: mealType as MealType,
          description: description!.trim(),
        }))
    );

    if (items.length === 0) {
      setError("Fill in at least one meal before submitting.");
      return;
    }

    setBusy(true);
    const res = await fetch("/api/menu-proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() || undefined, weekStartDate, items }),
    });
    const body = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(body.error ?? "Could not submit the proposal");
      return;
    }
    router.push("/menu");
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" hint="Leave blank for a default title.">
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Budget-friendly week"
            />
          </Field>
          <Field label="Week starting" hint="Any day in the target week works.">
            <input
              type="date"
              className={inputClass}
              value={weekStartDate}
              onChange={(e) => setWeekStartDate(e.target.value)}
              required
            />
          </Field>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-1 text-sm">
            <thead>
              <tr>
                <th className="w-24 text-left text-xs font-medium text-slate-500">Day</th>
                {MEAL_TYPES.map((mealType) => (
                  <th key={mealType} className="text-left text-xs font-medium text-slate-500">
                    {MEAL_TYPE_LABELS[mealType]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAY_LABELS.map((label, dayOfWeek) => (
                <tr key={label}>
                  <td className="py-1 pr-2 text-xs font-medium text-slate-700">{label}</td>
                  {MEAL_TYPES.map((mealType) => (
                    <td key={mealType} className="py-1">
                      <input
                        className={inputClass}
                        value={grid[dayOfWeek]?.[mealType] ?? ""}
                        onChange={(e) => setCell(dayOfWeek, mealType, e.target.value)}
                        placeholder="—"
                        disabled={busy}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Submitting…" : "Submit proposal"}
        </button>
      </form>
    </Card>
  );
}
