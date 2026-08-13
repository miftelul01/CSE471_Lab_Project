import { EmptyState, PageHeader } from "@/components/ui";
import { getActiveHouseId, requireUser } from "@/lib/auth";

import { MealAttendanceBoard } from "@/Araf/M2.3-MealAttendance/MealAttendanceBoard";
import { loadMealAttendancePageData } from "@/Araf/M2.3-MealAttendance/mealAttendance";

export const metadata = { title: "Meal attendance — Smart Mess" };

/** M2.3 Meal Attendance & Auto-Quantity Adjustment. */
export default async function MealsPage() {
  const user = await requireUser();
  const houseId = await getActiveHouseId(user.id);

  if (!houseId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Meal attendance"
          subtitle="Meals only exist after you join a house, because attendance is calculated from your household membership."
        />
        <EmptyState
          title="Join a house to use meal attendance"
          hint="Once you are part of a house, this page shows upcoming meals and lets you toggle attend or skip."
        />
      </div>
    );
  }

  const data = await loadMealAttendancePageData(user.id, houseId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meal attendance"
        subtitle="Attend or skip upcoming meals. The headcount and any linked meal expense stay in sync automatically."
      />
      <MealAttendanceBoard {...data} />
    </div>
  );
}
