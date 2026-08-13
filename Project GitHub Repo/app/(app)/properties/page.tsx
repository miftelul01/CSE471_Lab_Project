import Link from "next/link";
import { redirect } from "next/navigation";

import { PropertyTable } from "./PropertyTable";
import { Icon } from "@/components/Icon";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Properties — Smart Mess" };

/**
 * A landlord's own portfolio: everything they've posted, including delisted
 * rooms, with edit / delist / re-list in one place.
 *
 * Deliberately its own route rather than /listings?mine=true. Driving a whole
 * page mode off a query parameter meant the browse page and the management
 * page were the same route, which made client-side navigation between them
 * unreliable — and they are genuinely different screens with different jobs.
 */
export default async function PropertiesPage() {
  const user = await requireUser();

  // Residents have no portfolio; send them to the browse page instead.
  if (user.profile.role === "RESIDENT") redirect("/listings");

  const listings = await prisma.listing.findMany({
    where: { landlordId: user.id },
    include: {
      house: { select: { id: true, name: true } },
      _count: { select: { joinRequests: true, favorites: true } },
    },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });

  const active = listings.filter((l) => l.isActive).length;
  const applicants = await prisma.joinRequest.count({
    where: { listing: { landlordId: user.id }, status: "PENDING" },
  });
  const monthlyTotal = listings
    .filter((l) => l.isActive)
    .reduce((sum, l) => sum + Number(l.rent), 0);

  return (
    <div>
      <PageHeader
        title="Properties"
        subtitle="Rooms and houses you have posted. Delisted properties stay here so you can put them back."
        action={
          <Link
            href="/listings/new"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-card transition hover:bg-brand-800"
          >
            <Icon name="building" className="h-4 w-4" />
            Post a listing
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Listed" value={String(active)} hint="Visible in search" />
        <Summary
          label="Delisted"
          value={String(listings.length - active)}
          hint="Hidden, but not deleted"
        />
        <Summary
          label="Pending applicants"
          value={String(applicants)}
          hint="Waiting on your decision"
        />
        <Summary
          label="Listed monthly value"
          value={`৳${monthlyTotal.toLocaleString()}`}
          hint="Combined rent of active rooms"
        />
      </div>

      {listings.length === 0 ? (
        <EmptyState
          title="You haven't posted anything yet"
          hint={
            <Link href="/listings/new" className="underline">
              Post your first room
            </Link>
          }
        />
      ) : (
        <PropertyTable
          listings={listings.map((l) => ({
            id: l.id,
            title: l.title,
            area: l.area,
            roomType: l.roomType,
            rent: Number(l.rent),
            capacity: l.capacity,
            isActive: l.isActive,
            houseName: l.house?.name ?? null,
            applicants: l._count.joinRequests,
            saves: l._count.favorites,
          }))}
        />
      )}
    </div>
  );
}

function Summary({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="tabular mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
