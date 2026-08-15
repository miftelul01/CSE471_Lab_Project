import { MenuBoard } from "./MenuBoard";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { getActiveHouseId, requireUser } from "@/lib/auth";

export const metadata = { title: "Daily menu voting — Smart Mess" };

/** M2.2 Daily Meal Proposal & Ranked-Choice Voting — Mahia Tanzin. */
export default async function MenuPage() {
  const user = await requireUser();
  const houseId = await getActiveHouseId(user.id);

  if (!houseId) {
    return (
      <div>
        <PageHeader
          title="Daily menu voting"
          subtitle="Propose a day's meals and rank the house's candidates — each day is decided independently."
        />
        <EmptyState
          title="Join a house to use menu voting"
          hint="Go to the Houses page to create or join a house first."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Daily menu voting"
        subtitle="Propose a day's meals and rank the house's candidates — each day is decided independently by ranked-choice vote."
        action={<LinkButton href="/menu/new">Propose a meal</LinkButton>}
      />
      <MenuBoard />
    </div>
  );
}
