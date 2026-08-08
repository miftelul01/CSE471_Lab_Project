import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, Card, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "House — Administration" };

/**
 * Read-only inspection of one household.
 *
 * Deliberately has no edit controls: an administrator oversees houses, they do
 * not run them. Taking a post down and settling an escalated case each have
 * their own screen, where the decision gets recorded.
 */
export default async function AdminHouseDetailPage({ params }: { params: { id: string } }) {
  const house = await prisma.house.findUnique({
    where: { id: params.id },
    include: {
      landlord: { select: { name: true, email: true } },
      members: {
        where: { status: "ACTIVE" },
        include: { user: { select: { name: true, email: true } } },
      },
      listings: { select: { id: true, title: true, rent: true } },
      roommatePosts: { select: { id: true, title: true, monthlyShare: true } },
      disputes: { select: { id: true, title: true, state: true } },
      tickets: { select: { id: true, title: true, status: true } },
    },
  });

  if (!house) notFound();

  const nothingAdvertised = house.listings.length + house.roommatePosts.length === 0;
  const location = house.area ? `${house.address} · ${house.area}` : house.address;

  return (
    <div className="space-y-5">
      <Link href="/admin/houses" className="text-sm text-slate-600 hover:underline">
        ← All houses
      </Link>

      <PageHeader
        title={house.name}
        subtitle={`${location} · landlord ${house.landlord?.name ?? "unassigned"}`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Members</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {house.members.length === 0 ? (
              <li className="py-2 text-slate-500">Nobody has moved in yet.</li>
            ) : null}
            {house.members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-slate-900">
                    {member.user.name || member.user.email}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{member.user.email}</span>
                </span>
                {member.isHouseAdmin ? <Badge tone="brand">Flat admin</Badge> : null}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Rooms advertised</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {nothingAdvertised ? (
              <li className="py-2 text-slate-500">Nothing advertised.</li>
            ) : null}
            {house.listings.map((listing) => (
              <li key={listing.id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-slate-900">{listing.title}</span>
                <span className="tabular shrink-0 text-xs text-slate-500">
                  ৳{Number(listing.rent).toLocaleString()} · rental
                </span>
              </li>
            ))}
            {house.roommatePosts.map((post) => (
              <li key={post.id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-slate-900">{post.title}</span>
                <span className="tabular shrink-0 text-xs text-slate-500">
                  ৳{Number(post.monthlyShare).toLocaleString()} · roommate
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Disputes</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {house.disputes.length === 0 ? <li className="py-2 text-slate-500">None.</li> : null}
            {house.disputes.map((dispute) => (
              <li key={dispute.id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-slate-900">{dispute.title}</span>
                <Badge tone={dispute.state === "ESCALATED" ? "red" : "slate"}>
                  {dispute.state.toLowerCase()}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Maintenance</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {house.tickets.length === 0 ? <li className="py-2 text-slate-500">None.</li> : null}
            {house.tickets.map((ticket) => (
              <li key={ticket.id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-slate-900">{ticket.title}</span>
                <Badge tone={ticket.status === "RESOLVED" ? "green" : "amber"}>
                  {ticket.status.toLowerCase().replace("_", " ")}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
