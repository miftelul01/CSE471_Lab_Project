import { FeatureStub } from "@/components/FeatureStub";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Map — Smart Mess" };

/** another area Google Maps API Integration. */
export default async function MapPage() {
  await requireUser();

  return (
    <FeatureStub
      featureId="another area"
      checklist={[
        "Put your key in NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, then restrict it by HTTP referrer in the Google Cloud console — a NEXT_PUBLIC_ key is visible to anyone who opens devtools.",
        "Read listings (with latitude/longitude) from GET /api/listings and drop a marker per listing.",
        "Click a marker -> info window with title, rent and a link to the listing detail page.",
        "Add the commute helper: Distance Matrix API from a typed destination (e.g. BRAC University) to each listing.",
        "Handle listings with null coordinates — several will have them until the matching create form starts geocoding addresses.",
        "This page has no API route or tables of its own; it reads the matching listings. Coordinate with Miftelul if you need extra columns.",
      ]}
    />
  );
}
