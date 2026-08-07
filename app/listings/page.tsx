import { FeatureStub } from "@/components/FeatureStub";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Listings — Smart Mess" };

/** M1.1 Property & Room Listing Engine — Miftelul Mehebub. */
export default async function ListingsPage() {
  await requireUser();

  return (
    <FeatureStub
      featureId="M1.1"
      checklist={[
        "Build the browse view: GET /api/listings already returns active listings — render them as cards.",
        "Add the search/filter bar (budget range, area, room type) and pass the values as query params.",
        "Build the landlord form that POSTs a new listing. Only show it when profile.role is LANDLORD.",
        "Add app/listings/[id]/page.tsx for the detail view, with edit and delist buttons.",
        "Implement PATCH and DELETE in app/api/listings/[id]/route.ts. Delisting = set is_active false, not a hard delete — matching and favourites reference these rows.",
        "Set latitude/longitude when creating a listing so M3.3 can plot it on the map.",
      ]}
    />
  );
}
