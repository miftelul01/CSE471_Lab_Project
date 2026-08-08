import { FeatureStub } from "@/components/FeatureStub";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Meal attendance — Smart Mess" };

/** another area Meal Attendance & Auto-Quantity Adjustment. */
export default async function MealsPage() {
  await requireUser();

  return (
    <FeatureStub
      featureId="another area"
      checklist={[
        "Show the next few days of meals from GET /api/meals with an attend/skip toggle per meal.",
        "Wire the toggle to upsert meal_attendance on (meal_id, user_id). The headcount recalculation is a database trigger, so you never compute it in JS — just re-read meals.headcount.",
        "Add the cook's view: required quantity per meal = headcount, plus the per-head cost.",
        "Cost adjustment: when someone skips, their share of that meal's cost comes off their expense_shares row from another area. Agree the mechanism with Miftelul — either a negative adjustment expense or a direct share update.",
        "Respect meals.locks_at: after it passes, RLS rejects attendance changes. Disable the toggle in the UI so it fails clearly rather than mysteriously.",
        "Auto-create the day's meal rows (a small job or on first view), optionally linked to the approved menu_proposal from another area.",
      ]}
    />
  );
}
