import Link from "next/link";

import { ProposeMenuForm } from "./ProposeMenuForm";
import { EmptyState, PageHeader } from "@/components/ui";
import { getActiveHouseId, requireUser } from "@/lib/auth";

export const metadata = { title: "Propose a meal — Smart Mess" };

/** M2.2 Daily Meal Proposal & Ranked-Choice Voting — Mahia Tanzin. */
export default async function ProposeMenuPage() {
  const user = await requireUser();
  const houseId = await getActiveHouseId(user.id);

  if (!houseId) {
    return (
      <div>
        <PageHeader title="Propose a meal" />
        <EmptyState
          title="Join a house to propose a meal"
          hint="Go to the Houses page to create or join a house first."
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Propose a meal"
        subtitle="Pick a day and fill in as many meals as you like — your candidate competes in that day's own ranked-choice vote, independent of every other day."
      />
      <ProposeMenuForm />
      <p className="mt-4 text-sm text-slate-500">
        <Link href="/menu" className="underline">
          Back to the menu board
        </Link>
      </p>
    </div>
  );
}
