import { FeatureStub } from "@/components/FeatureStub";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Map — Smart Mess" };

/** M3.3 Google Maps API Integration — Mahia Tanzin. */
export default async function MapPage() {
  await requireUser();

  return (
    <FeatureStub
      featureId="M3.3"
      checklist={[
        "Put your key in NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, then restrict it by HTTP referrer in the Google Cloud console — a NEXT_PUBLIC_ key is visible to anyone who opens devtools.",
        "Read listings (with latitude/longitude) from GET /api/listings and drop a marker per listing.",
        "Click a marker -> info window with title, rent and a link to the listing detail page.",
        "Add the commute helper: Distance Matrix API from a typed destination (e.g. BRAC University) to each listing.",
        "Handle listings with null coordinates — several will have them until M1.1's create form starts geocoding addresses.",
        "This page has no API route or tables of its own; it reads M1.1's listings. Coordinate with Miftelul if you need extra columns.",
      ]}
    />
  );
}
