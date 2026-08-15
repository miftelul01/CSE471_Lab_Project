import { FeatureStub } from "@/components/FeatureStub";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Listings map — Smart Mess" };

/**
 * M3.3 Listings Map & Commute Evaluation — another area's feature.
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
    <FeatureStub
      featureId="M3.3"
      checklist={[
        "Scope: rental listings only. Places a household already uses belong to M2.4 at /neighborhood — do not add shops, bazars or services here.",
        "Put your key in NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, then restrict it by HTTP referrer in the Google Cloud console — a NEXT_PUBLIC_ key is visible to anyone who opens devtools. (M2.4 avoids this problem entirely by proxying its provider server-side; worth copying if you'd rather not ship a key at all.)",
        "Read listings (with latitude/longitude) from GET /api/listings and drop a marker per listing.",
        "Click a marker -> info window with title, rent and a link to the listing detail page.",
        "Add the commute helper: Distance Matrix API from a typed destination (e.g. BRAC University) to each listing.",
        "Handle listings with null coordinates — several will have them until the matching create form starts geocoding addresses.",
        "This page has no API route or tables of its own; it reads the matching listings. Coordinate with Miftelul if you need extra columns.",
      ]}
    />
  );
}
