import { EmptyState, PageHeader } from "@/components/ui";
import { getActiveHouseId, requireUser } from "@/lib/auth";
import { ChoresView } from "./ChoresView";

export const metadata = { title: "Chores — Smart Mess" };
export const dynamic = "force-dynamic";

/**
 * M3.4 Automated Chore Rotation (Google Tasks) — Mahia Tanzin.
 *
 * Weekly chores rotate through residents automatically (app/api/cron/chores)
 * and each assignment is pushed to that person's own "Household Chores"
 * Google Tasks list — a separate, disclosed consent step from signing in
 * with Google (see GoogleConnectCard for why).
 */
export default async function ChoresPage({
  searchParams,
}: {
  searchParams: { google?: string };
}) {
  const user = await requireUser();
  const houseId = await getActiveHouseId(user.id);

  if (!houseId) {
    return (
      <div>
        <PageHeader title="Chores" />
        <EmptyState title="Join a house to see its chores" hint="Chores rotate through a household." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chores"
        subtitle="Weekly chores rotate through the house automatically and land in each person's own Google Tasks."
      />
      <ChoresView
        currentUserId={user.id}
        googleStatus={searchParams.google === "connected" || searchParams.google === "error" ? searchParams.google : null}
      />
    </div>
  );
}
