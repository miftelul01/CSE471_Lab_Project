"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { MealType } from "@prisma/client";

import { Badge, Card, ErrorNote, Field, SuccessNote, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import type { MealAttendancePageData, MealAttendanceView } from "./mealAttendance";

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(amount: number): string {
  return `৳${amount.toLocaleString()}`;
}

function groupMealsByDate(meals: MealAttendanceView[]) {
  const grouped = new Map<string, MealAttendanceView[]>();

  for (const meal of meals) {
    const dateKey = meal.mealDate.slice(0, 10);
    const bucket = grouped.get(dateKey) ?? [];
    bucket.push(meal);
    grouped.set(dateKey, bucket);
  }

  return Array.from(grouped.entries()).map(([dateKey, dayMeals]) => ({
    dateKey,
    dateLabel: formatDate(dayMeals[0].mealDate),
    meals: dayMeals,
  }));
}

async function parseJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export function MealAttendanceBoard({
  house,
  canManageMeals,
  meals,
}: MealAttendancePageData) {
  const router = useRouter();
  const [busyMealId, setBusyMealId] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const groupedMeals = useMemo(() => groupMealsByDate(meals), [meals]);

  function showFeedback(message: string | null, successMessage: string | null = null) {
    setError(message);
    setSuccess(successMessage);
  }

  async function toggleAttendance(meal: MealAttendanceView) {
    if (busyMealId || isSaving || meal.locked) return;

    setBusyMealId(meal.id);
    showFeedback(null, null);

    startTransition(async () => {
      const desiredStatus = meal.myAttendance === "ATTENDING" ? "SKIPPING" : "ATTENDING";
      const response = await fetch("/api/meals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealId: meal.id, status: desiredStatus }),
      });

      const payload = await parseJson(response);
      if (!response.ok) {
        showFeedback(payload.error ?? "Could not update attendance.");
        setBusyMealId(null);
        return;
      }

      setBusyMealId(null);
      setSuccess(`${MEAL_TYPE_LABELS[meal.mealType]} attendance updated.`);
      router.refresh();
    });
  }

  function handleCreateMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    const formData = new FormData(event.currentTarget);
    const mealDate = String(formData.get("mealDate") ?? "");
    const mealType = String(formData.get("mealType") ?? "") as MealType;
    const costPerHeadValue = String(formData.get("costPerHead") ?? "").trim();
    const locksAtValue = String(formData.get("locksAt") ?? "").trim();

    showFeedback(null, null);

    startTransition(async () => {
      const response = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealDate,
          mealType,
          costPerHead: costPerHeadValue ? Number(costPerHeadValue) : null,
          locksAt: locksAtValue || null,
        }),
      });

      const payload = await parseJson(response);
      if (!response.ok) {
        showFeedback(payload.error ?? "Could not save meal slot.");
        return;
      }

      setSuccess("Meal slot saved.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">{house.name}</p>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Attendance toggles recalculate the cook's quantity automatically. If a meal has a cost per head, the shared wallet is kept in sync with the currently attending residents.
            </p>
          </div>
          <Badge tone="brand">{meals.length} meal slots</Badge>
        </div>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {success ? <SuccessNote>{success}</SuccessNote> : null}

        {canManageMeals ? (
          <form onSubmit={handleCreateMeal} className="mt-4 grid gap-4 rounded-lg border border-dashed border-slate-200 p-4 lg:grid-cols-4">
            <Field label="Meal date">
              <input type="date" name="mealDate" className={inputClass} required />
            </Field>

            <Field label="Meal type">
              <select name="mealType" className={inputClass} defaultValue="BREAKFAST" required>
                {Object.entries(MEAL_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Cost per head (optional)">
              <input type="number" name="costPerHead" step="0.01" min="0" className={inputClass} />
            </Field>

            <Field label="Locks at (optional)">
              <input type="datetime-local" name="locksAt" className={inputClass} />
            </Field>

            <div className="lg:col-span-4">
              <button type="submit" className={buttonClass} disabled={isSaving}>
                {isSaving ? "Saving meal slot..." : "Save meal slot"}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      <div className="space-y-4">
        {groupedMeals.map((group) => (
          <section key={group.dateKey} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {group.dateLabel}
            </h2>
            <div className="grid gap-4 lg:grid-cols-3">
              {group.meals.map((meal) => {
                const attending = meal.myAttendance === "ATTENDING";
                const toggleLabel = attending ? "Skip meal" : "Attend meal";
                const attendingCount = meal.headcount;
                const skippingCount = Math.max(meal.attendees.length - meal.headcount, 0);
                const totalCost = meal.costPerHead !== null ? meal.costPerHead * meal.headcount : null;
                const buttonDisabled = meal.locked || busyMealId === meal.id;

                return (
                  <Card key={meal.id} className="flex h-full flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium text-slate-900">{MEAL_TYPE_LABELS[meal.mealType]}</h3>
                        <p className="text-xs text-slate-500">{meal.mealLabel}</p>
                      </div>
                      <Badge tone={meal.locked ? "red" : attending ? "green" : "amber"}>
                        {meal.locked ? "Locked" : attending ? "Attending" : "Skipping"}
                      </Badge>
                    </div>

                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Required quantity</p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">{attendingCount}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Skipped</p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">{skippingCount}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Cost per head</p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">
                          {meal.costPerHead !== null ? formatCurrency(meal.costPerHead) : "Not set"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Meal total</p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">
                          {totalCost !== null ? formatCurrency(totalCost) : "Not set"}
                        </p>
                      </div>
                    </div>

                    {meal.menuProposalTitle ? (
                      <p className="mt-3 text-xs text-slate-500">
                        Linked menu: <span className="font-medium text-slate-700">{meal.menuProposalTitle}</span>
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={buttonDisabled ? secondaryButtonClass + " opacity-50" : secondaryButtonClass}
                        disabled={buttonDisabled}
                        onClick={() => toggleAttendance(meal)}
                      >
                        {busyMealId === meal.id ? "Saving..." : toggleLabel}
                      </button>
                      {meal.locksAt ? (
                        <p className="self-center text-xs text-slate-500">
                          Locks at {new Date(meal.locksAt).toLocaleString("en-GB", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Roster</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {meal.attendees.map((attendee) => (
                          <Badge key={attendee.id} tone={attendee.status === "ATTENDING" ? "green" : "slate"}>
                            {attendee.name} · {attendee.status.toLowerCase()}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
