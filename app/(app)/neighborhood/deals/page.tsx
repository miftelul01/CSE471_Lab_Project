import Link from "next/link";

import { DealFeed } from "../DealFeed";
import { EmptyState, PageHeader, secondaryButtonClass } from "@/components/ui";
import { getActiveHouseId, requireUser } from "@/lib/auth";
import { listDeals } from "@/lib/neighborhood.server";

export const metadata = { title: "Deals — Smart Mess" };
export const dynamic = "force-dynamic";

/**
 * M2.4 — the deals layer, as a feed.
 *
 * An optional layer over the map, never the point of it. The places are the
 * durable knowledge; a discount is a thing that happens to one of them for a
 * fortnight.
 */
export default async function DealsPage() {
  const user = await requireUser();
  const houseId = await getActiveHouseId(user.id);

  if (!houseId) {
    return (
      <div>
        <PageHeader title="Deals" />
        <EmptyState title="Join a house to see its deals" />
      </div>
    );
  }

  const deals = await listDeals(user, houseId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deals"
        subtitle="Time-bound offers at the places your flat already uses. Soonest to end, first."
        action={
          <Link href="/neighborhood" className={secondaryButtonClass}>
            Back to need finder
          </Link>
        }
      />

      <DealFeed deals={deals} />
    </div>
  );
}
