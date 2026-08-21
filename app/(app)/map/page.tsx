import Link from "next/link";

import { ListingsMapView } from "./ListingsMapView";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { mapStyleUrl } from "@/lib/mapProviders";

export const metadata = { title: "Listings map — Smart Mess" };
export const dynamic = "force-dynamic";

/**
 * M3.3 Listings Map & Commute Evaluation — Mahia Tanzin.
 *
 * ── SCOPE BOUNDARY ──────────────────────────────────────────────────────────
 * This map is for PROSPECTIVE tenants: where are the rooms for rent, and how
 * far is each from the place I have to get to every morning. It plots the
 * `listings` table and nothing else.
 *
 * It is NOT the household's map. Where a flat buys its groceries, which
 * pharmacy stays open late, who delivers gas cylinders — that is M2.4, at
 * /neighborhood, scoped to the house you live in and readable only by the
 * people who live there. The two must not merge: one is a shop window for
 * people outside the house, the other is private operational knowledge
 * belonging to the people inside it.
 * ────────────────────────────────────────────────────────────────────────────
 */
export default async function MapPage() {
  await requireUser();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Listings map"
        subtitle="Rental rooms plotted by location, with a commute helper from wherever you need to get to."
        action={
          <Link href="/map/saved-searches" className={secondaryButtonClass}>
            Saved searches
          </Link>
        }
      />

      <ListingsMapView styleUrl={mapStyleUrl()} />
    </div>
  );
}
