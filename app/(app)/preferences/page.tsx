import { PreferencesForm } from "./PreferencesForm";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "My preferences — Smart Mess" };

/** another area — lifestyle preference profile (Mahia Tanzin). */
export default async function PreferencesPage() {
  const user = await requireUser();
  const preference = await prisma.preference.findUnique({ where: { userId: user.id } });

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="My lifestyle preferences"
        subtitle="These feed the matching engine. The closer they are to reality, the better your suggested houses will be."
      />
      <PreferencesForm
        preference={
          preference && {
            budgetMin: Number(preference.budgetMin),
            budgetMax: Number(preference.budgetMax),
            sleepSchedule: preference.sleepSchedule,
            cleanliness: preference.cleanliness,
            smokingOk: preference.smokingOk,
            petsOk: preference.petsOk,
            preferredArea: preference.preferredArea,
          }
        }
      />
    </div>
  );
}
