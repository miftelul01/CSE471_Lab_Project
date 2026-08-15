import Link from "next/link";

import { HousePinSetup } from "./HousePinSetup";
import { NeedFinder } from "./NeedFinder";
import { RemovedPlaces } from "./RemovedPlaces";
import { Badge, Card, EmptyState, PageHeader, secondaryButtonClass } from "@/components/ui";
import { getActiveHouseId, requireUser } from "@/lib/auth";
import { isHouseAdmin } from "@/lib/authz";
import { mapStyleUrl } from "@/lib/mapProviders";
import { listBookmarks, getSuggestedPin, listDeals } from "@/lib/neighborhood.server";

export const metadata = { title: "Neighbourhood — Smart Mess" };
export const dynamic = "force-dynamic";

const SUBTITLE =
  "Everywhere your flat needs to know about, in one place — kacha bazar, pharmacy, gas cylinder, the tailor who actually finishes on time. Whoever moves in next inherits all of it.";

/**
 * M2.4 Shared House Map & Neighbourhood Knowledge Base — Miftelul Mehebub.
 *
 * The need finder is the front door: most visits are somebody wanting one
 * answer ("where do we get gas?"), not somebody wanting to browse a map.
 *
 * The house whose map this shows comes from the session's active residency and
 * from nowhere else. There is no house id in this URL, and there must never be.
 */
export default async function NeighborhoodPage() {
  const user = await requireUser();
  const houseId = await getActiveHouseId(user.id);

  if (!houseId) {
    return (
      <div>
        <PageHeader title="Neighbourhood" subtitle={SUBTITLE} />
        <EmptyState
          title="Join a house to see its map"
          hint="The neighbourhood map belongs to a household — go to My houses to create or join one."
        />
      </div>
    );
  }

  const [list, canManage, suggested, deals] = await Promise.all([
    listBookmarks(user, houseId, { includeDeleted: true }),
    isHouseAdmin(user.id, houseId),
    getSuggestedPin(houseId),
    listDeals(user, houseId),
  ]);

  const liveDeals = deals.filter(
    (deal) => deal.status === "ACTIVE" || deal.status === "EXPIRING_SOON"
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Neighbourhood"
        subtitle={SUBTITLE}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/neighborhood/map" className={secondaryButtonClass}>
              Map view
            </Link>
            <Link href="/neighborhood/deals" className={secondaryButtonClass}>
              Deals
              {liveDeals.length > 0 ? (
                <span className="ml-1.5">
                  <Badge tone="amber">{liveDeals.length}</Badge>
                </span>
              ) : null}
            </Link>
          </div>
        }
      />

      {list.pin ? null : (
        <HousePinSetup
          suggested={suggested}
          canSetPin={canManage}
          styleUrl={mapStyleUrl()}
        />
      )}

      {list.pin ? null : (
        <Card className="border-slate-200 bg-slate-50">
          <p className="text-sm text-slate-700">
            Distances, nearest-first ranking and directions are switched off until the house pin is
            placed. Everything else on this page works now.
          </p>
        </Card>
      )}

      {list.removed.length > 0 ? (
        <RemovedPlaces removed={list.removed} canRestore={canManage} />
      ) : null}

      <NeedFinder placed={list.placed} online={list.online} hasPin={list.pin !== null} />
    </div>
  );
}
