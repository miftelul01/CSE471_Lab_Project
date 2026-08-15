import Link from "next/link";

import { MapView } from "../MapView";
import { EmptyState, PageHeader, secondaryButtonClass } from "@/components/ui";
import { getActiveHouseId, requireUser } from "@/lib/auth";
import { hasTileProvider } from "@/lib/mapProviders";
import { listBookmarks } from "@/lib/neighborhood.server";

export const metadata = { title: "House map — Smart Mess" };
export const dynamic = "force-dynamic";

/**
 * M2.4 — the browse view.
 *
 * Distinct from Module 3's map, which plots rental listings for people who do
 * not live here yet. This one plots the places the household actually uses.
 */
export default async function HouseMapPage() {
  const user = await requireUser();
  const houseId = await getActiveHouseId(user.id);

  if (!houseId) {
    return (
      <div>
        <PageHeader title="House map" />
        <EmptyState
          title="Join a house to see its map"
          hint="The neighbourhood map belongs to a household."
        />
      </div>
    );
  }

  const list = await listBookmarks(user, houseId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="House map"
        subtitle="Everywhere your flat uses, colour-coded by what it's for. Long-press anywhere to note a new place."
        action={
          <Link href="/neighborhood" className={secondaryButtonClass}>
            Back to need finder
          </Link>
        }
      />

      <MapView
        pin={list.pin}
        placed={list.placed}
        online={list.online}
        tilesEnabled={hasTileProvider()}
      />
    </div>
  );
}
