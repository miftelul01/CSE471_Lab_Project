import { notFound, redirect } from "next/navigation";

import { ListingForm } from "../../ListingForm";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getAdministeredHouses } from "@/lib/houses";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Edit listing — Smart Mess" };

/** M1.1 — edit a listing. */
export default async function EditListingPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const listing = await prisma.listing.findUnique({ where: { id: params.id } });
  if (!listing) notFound();

  // The API re-checks this with assertCanEditListing; checking here too means a
  // non-owner is redirected rather than filling in a form that will 403.
  if (listing.landlordId !== user.id && user.profile.role !== "ADMIN") {
    redirect(`/listings/${params.id}`);
  }

  const houses = await getAdministeredHouses(user.id);

  return (
    <div className="max-w-3xl">
      <PageHeader title="Edit listing" subtitle={listing.title} />
      <ListingForm houses={houses} listing={listing} />
    </div>
  );
}
