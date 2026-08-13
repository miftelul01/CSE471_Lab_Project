import Link from "next/link";

import { ProposeMenuForm } from "./ProposeMenuForm";
import { EmptyState, PageHeader } from "@/components/ui";
import { getActiveHouseId, requireUser } from "@/lib/auth";

export const metadata = { title: "Propose a menu — Smart Mess" };

/** M2.2 Weekly Menu Proposal & Voting System — Mahia Tanzin. */
export default async function ProposeMenuPage() {
  const user = await requireUser();
  const houseId = await getActiveHouseId(user.id);

  if (!houseId) {
    return (
      <div>
        <PageHeader title="Propose a menu" />
        <EmptyState
          title="Join a house to propose a menu"
          hint="Go to the Houses page to create or join a house first."
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Propose a menu"
        subtitle="Fill in as many meals as you like — an empty cell is simply left off the plan. Your housemates vote once you submit."
      />
      <ProposeMenuForm />
      <p className="mt-4 text-sm text-slate-500">
        <Link href="/menu" className="underline">
          Back to weekly menu
        </Link>
      </p>
    </div>
  );
}
