import { redirect } from "next/navigation";

import { ListingForm } from "../ListingForm";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getAdministeredHouses } from "@/lib/houses";

export const metadata = { title: "Post a listing — Smart Mess" };

/** another area — create a listing (landlords only). */
export default async function NewListingPage() {
  const user = await requireUser();

  // Residents have no business here; send them back to browsing rather than
  // letting them fill in a form the API will reject.
  if (user.profile.role === "RESIDENT") redirect("/listings");

  const houses = await getAdministeredHouses(user.id);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Post a listing"
        subtitle="Residents will be able to search and filter this, and request to join."
      />
      <ListingForm houses={houses} />
    </div>
  );
}
