import { notFound, redirect } from "next/navigation";

import { ListingForm } from "../../ListingForm";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getAdministeredHouses } from "@/lib/houses";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Edit listing — Smart Mess" };

/** another area — edit a listing. */
export default async function EditListingPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const listing = await prisma.listing.findUnique({ where: { id: params.id } });
  if (!listing) notFound();

  // Mirrors assertCanEditListing, which the API enforces: the owner or a
  // system administrator, nobody else. Checking here too means anyone else is
  // redirected rather than filling in a form that would 403 on save.
  const mayEdit = listing.landlordId === user.id || user.profile.role === "ADMIN";
  if (!mayEdit) redirect(`/listings/${params.id}`);

  const houses = await getAdministeredHouses(user.id);

  return (
    <div className="max-w-3xl">
      <PageHeader title="Edit listing" subtitle={listing.title} />
      <ListingForm houses={houses} listing={listing} />
    </div>
  );
}
