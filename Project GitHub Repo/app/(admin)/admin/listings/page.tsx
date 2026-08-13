import { ModerationTable } from "./ModerationTable";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Rental listings — Administration" };

/** Moderation of every rental listing on the platform. */
export default async function AdminListingsPage() {
  const listings = await prisma.listing.findMany({
    include: {
      landlord: { select: { name: true, email: true } },
      house: { select: { name: true } },
      removedBy: { select: { name: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Rental listings"
        subtitle="Every room posted by a landlord, across all houses. Removing one hides it from search and tells the owner why."
      />
      <ModerationTable
        kind="listing"
        rows={listings.map((l) => ({
          id: l.id,
          title: l.title,
          owner: l.landlord.name || l.landlord.email,
          context: l.house?.name ?? l.area,
          amount: Number(l.rent),
          isActive: l.isActive,
          status: l.status,
          removedReason: l.removedReason,
          removedBy: l.removedBy?.name ?? null,
        }))}
      />
    </div>
  );
}
