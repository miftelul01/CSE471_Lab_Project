import { FeatureStub } from "@/components/FeatureStub";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Weekly menu — Smart Mess" };

/** another area Weekly Menu Proposal & Voting System. */
export default async function MenuPage() {
  await requireUser();

  return (
    <FeatureStub
      featureId="another area"
      checklist={[
        "Show next week's open proposals from GET /api/menu-proposals with their current vote tally and which way you voted.",
        "Build the propose form: a 7x3 grid (day x breakfast/lunch/dinner) that writes menu_proposal_items rows.",
        "Wire the vote buttons to POST /api/menu-proposals/[id]/vote. Upsert on (proposal_id, user_id) so changing your mind replaces your vote instead of erroring.",
        "Add the 'close voting' action: highest net score wins and becomes APPROVED, the rest become REJECTED. A partial unique index enforces one approved menu per house per week, so promoting a second one will fail loudly — that is intended.",
        "Show the approved menu as the official week's menu.",
        "another area links meals.menu_proposal_id back to the winning proposal — check with Araf before changing that column.",
      ]}
    />
  );
}
