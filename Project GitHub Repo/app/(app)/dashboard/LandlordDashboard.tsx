import Link from "next/link";

import { Action, Heading, Panel, PrimaryLink, StatCard } from "./shared";
import { Badge } from "@/components/ui";
import { prisma } from "@/lib/prisma";

/**
 * The landlord runs a property business, not a household.
 *
 * Occupancy, applicants, rent roll and what his tenants have reported — no
 * balance due, no meals, no chores, because he does not live in any of it.
 */
export async function LandlordDashboard({ userId, name }: { userId: string; name: string }) {
  const houses = await prisma.house.findMany({
    where: { landlordId: userId },
    select: { id: true, name: true, area: true, _count: { select: { members: true } } },
  });
  const houseIds = houses.map((h) => h.id);

  const [listings, pendingApplications, openTickets, recentApplications, recentTickets] =
    await Promise.all([
      prisma.listing.findMany({
        where: { landlordId: userId },
        select: { id: true, rent: true, isActive: true, capacity: true },
      }),
      prisma.joinRequest.count({
        where: { status: "PENDING", listing: { landlordId: userId } },
      }),
      prisma.maintenanceTicket.count({
        where: { houseId: { in: houseIds }, status: { in: ["OPEN", "IN_PROGRESS"] } },
      }),
      prisma.joinRequest.findMany({
        where: { status: "PENDING", listing: { landlordId: userId } },
        include: {
          user: { select: { name: true, email: true } },
          listing: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
      prisma.maintenanceTicket.findMany({
        where: { houseId: { in: houseIds }, status: { in: ["OPEN", "IN_PROGRESS"] } },
        include: { house: { select: { name: true } }, reportedBy: { select: { name: true } } },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 4,
      }),
    ]);

  const active = listings.filter((l) => l.isActive);
  const rentRoll = active.reduce((sum, l) => sum + Number(l.rent), 0);
  const beds = active.reduce((sum, l) => sum + l.capacity, 0);
  const tenants = houses.reduce((sum, h) => sum + h._count.members, 0);

  return (
    <div className="space-y-6">
      <Heading
        name={name}
        role="Landlord"
        context={`${houses.length} propert${houses.length === 1 ? "y" : "ies"} · ${active.length} room${active.length === 1 ? "" : "s"} on the market.`}
        actions={
          <>
            <Action href="/properties" icon="building" label="My properties" />
            <PrimaryLink href="/listings/new" icon="building" label="Post a room" />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="wallet"
          label="Monthly rent roll"
          value={`৳${rentRoll.toLocaleString()}`}
          hint={`Across ${active.length} listed room${active.length === 1 ? "" : "s"}`}
        />
        <StatCard
          icon="users"
          label="Applications waiting"
          value={String(pendingApplications)}
          hint="People wanting one of your rooms"
        />
        <StatCard
          icon="building"
          label="Occupancy"
          value={`${tenants}/${beds || "—"}`}
          hint="Tenants against advertised beds"
        />
        <StatCard
          icon="wrench"
          label="Tenant repairs"
          value={String(openTickets)}
          hint="Reported and unresolved"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          icon="users"
          title="Applications to decide"
          subtitle={`${pendingApplications} waiting on you`}
        >
          {recentApplications.length === 0 ? (
            <p className="text-sm text-slate-600">Nobody is waiting. New applications land here.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {recentApplications.map((application) => (
                <li key={application.id} className="py-2.5">
                  <span className="block font-medium text-slate-900">
                    {application.user.name || application.user.email}
                  </span>
                  <span className="block text-xs text-slate-500">
                    applied for {application.listing.title}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/join-requests"
            className="mt-3 inline-block rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Review applications
          </Link>
        </Panel>

        <Panel icon="wrench" title="Repairs your tenants reported" subtitle="Highest priority first">
          {recentTickets.length === 0 ? (
            <p className="text-sm text-slate-600">Nothing outstanding across your properties.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {recentTickets.map((ticket) => (
                <li key={ticket.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">{ticket.title}</span>
                    <span className="block text-xs text-slate-500">
                      {ticket.house.name} · {ticket.reportedBy.name}
                    </span>
                  </span>
                  <Badge tone={ticket.priority === "HIGH" || ticket.priority === "URGENT" ? "red" : "slate"}>
                    {ticket.priority.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/maintenance"
            className="mt-3 inline-block rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Open maintenance
          </Link>
        </Panel>
      </div>

      <Panel icon="building" title="Your properties" subtitle="Occupancy per house">
        {houses.length === 0 ? (
          <p className="text-sm text-slate-600">
            You have no houses yet.{" "}
            <Link href="/houses" className="underline">
              Create one
            </Link>{" "}
            to start listing rooms.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {houses.map((house) => (
              <li key={house.id} className="flex items-center justify-between gap-3 py-2.5">
                <span>
                  <span className="block font-medium text-slate-900">{house.name}</span>
                  <span className="block text-xs text-slate-500">{house.area ?? "—"}</span>
                </span>
                <span className="tabular text-xs text-slate-500">
                  {house._count.members} living there
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
