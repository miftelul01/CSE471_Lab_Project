import Link from "next/link";

import { Icon } from "@/components/Icon";
import { getMyHouses, requireUser } from "@/lib/auth";
import { joinRequestVisibilityFilter } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import type { IconName } from "@/lib/navigation";

export const metadata = { title: "Dashboard — Smart Mess" };

function greeting() {
  const hour = new Date().getUTCHours() + 6; // Dhaka is UTC+6
  const h = ((hour % 24) + 24) % 24;
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const houses = await getMyHouses(user.id);
  const houseId = houses[0]?.houseId ?? null;

  const [outstanding, openTickets, highPriority, activeGuests, escalated, pendingRequests, myListings] =
    await Promise.all([
      prisma.expenseShare.aggregate({
        where: { userId: user.id, status: "PENDING" },
        _sum: { amount: true },
        _count: true,
      }),
      houseId
        ? prisma.maintenanceTicket.count({
            where: { houseId, status: { in: ["OPEN", "IN_PROGRESS"] } },
          })
        : 0,
      houseId
        ? prisma.maintenanceTicket.count({
            where: { houseId, status: { in: ["OPEN", "IN_PROGRESS"] }, priority: { in: ["HIGH", "URGENT"] } },
          })
        : 0,
      houseId ? prisma.guestLog.count({ where: { houseId, status: "CHECKED_IN" } }) : 0,
      houseId ? prisma.dispute.count({ where: { houseId, state: { in: ["VOTING", "ESCALATED"] } } }) : 0,
      prisma.joinRequest.count({
        where: { AND: [joinRequestVisibilityFilter(user), { status: "PENDING" }] },
      }),
      user.profile.role === "RESIDENT"
        ? 0
        : prisma.listing.count({ where: { landlordId: user.id, isActive: true } }),
    ]);

  const balance = Number(outstanding._sum.amount ?? 0);
  const isLandlord = user.profile.role !== "RESIDENT";

  const openDispute = houseId
    ? await prisma.dispute.findFirst({
        where: { houseId, state: { in: ["VOTING", "ESCALATED"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, state: true, votingDeadline: true },
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/dashboard" className="hover:text-slate-700">
              Overview
            </Link>{" "}
            / Dashboard
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            {greeting()}, {(user.profile.name || user.email).split(" ")[0]}
          </h1>
          <p className="mt-1 text-slate-600">
            {houses[0]
              ? `${houses[0].house.name} · here is what needs your attention today.`
              : "You have not joined a house yet — most features unlock once you do."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/wallet"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-card transition hover:bg-slate-50"
          >
            <Icon name="wallet" className="h-4 w-4" /> View ledger
          </Link>
          <Link
            href="/payments"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-card transition hover:bg-brand-800"
          >
            <Icon name="card" className="h-4 w-4" /> Pay ৳{balance.toLocaleString()}
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="wallet"
          label="Your balance due"
          value={`৳${balance.toLocaleString()}`}
          hint={`${outstanding._count} pending item${outstanding._count === 1 ? "" : "s"}`}
        />
        <StatCard
          icon={isLandlord ? "building" : "users"}
          label={isLandlord ? "Your active rooms" : "Requests you sent"}
          value={String(isLandlord ? myListings : pendingRequests)}
          hint={isLandlord ? "Listed and visible in search" : "Awaiting a landlord decision"}
        />
        <StatCard
          icon="wrench"
          label="Open tickets"
          value={String(openTickets)}
          hint={`${highPriority} high priority`}
        />
        <StatCard
          icon="guest"
          label="Active guests"
          value={String(activeGuests)}
          hint="Registered and within window"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <QuickAction href="/wallet" icon="wallet" label="Add expense" />
        <QuickAction href="/meals" icon="meal" label="Toggle meal" />
        <QuickAction href="/guests" icon="guest" label="Add guest" />
        <QuickAction href="/maintenance" icon="wrench" label="Raise ticket" />
        <QuickAction href="/payments" icon="card" label="Pay bill" />
      </div>

      {openDispute ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm text-amber-900">
            <span className="font-medium">{openDispute.title}</span>
            {openDispute.state === "ESCALATED"
              ? " — escalated, waiting on a decision."
              : openDispute.votingDeadline
                ? ` — consensus deadline ${openDispute.votingDeadline.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.`
                : " — open for voting."}
          </p>
          <Link
            href="/mess-court"
            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
          >
            Review case
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" icon="search" title="Find your next room" subtitle="Search by budget, area and room type">
          <RoomTeaser />
        </Panel>

        <Panel icon="users" title="Members & requests" subtitle={`${pendingRequests} awaiting a decision`}>
          <p className="text-sm text-slate-600">
            {pendingRequests === 0
              ? "Nothing pending right now."
              : isLandlord
                ? "People have applied to your rooms. Accepting a request admits them into the house."
                : "Your applications are with the landlord."}
          </p>
          <Link
            href="/join-requests"
            className="mt-4 inline-block rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Open requests
          </Link>
        </Panel>
      </div>
    </div>
  );
}

async function RoomTeaser() {
  const rooms = await prisma.listing.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true, title: true, area: true, rent: true, roomType: true },
  });

  if (rooms.length === 0) {
    return <p className="text-sm text-slate-600">No rooms listed yet.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {rooms.map((room) => (
        <li key={room.id}>
          <Link href={`/listings/${room.id}`} className="flex items-center justify-between gap-4 py-3">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-900">{room.title}</span>
              <span className="block text-xs text-slate-500">
                {room.area} · {room.roomType.toLowerCase().replace("_", " ")}
              </span>
            </span>
            <span className="tabular shrink-0 text-sm font-medium text-slate-900">
              ৳{Number(room.rent).toLocaleString()}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: IconName;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between">
        <p className="text-sm text-slate-600">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      <p className="tabular mt-3 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-700 shadow-card transition hover:border-slate-300 hover:text-slate-900"
    >
      <Icon name={icon} className="h-4 w-4 text-slate-400" />
      {label}
    </Link>
  );
}

function Panel({
  icon,
  title,
  subtitle,
  children,
  className = "",
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-card ${className}`}>
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-sm font-medium text-slate-900">{title}</span>
          {subtitle ? <span className="block text-xs text-slate-500">{subtitle}</span> : null}
        </span>
      </div>
      {children}
    </section>
  );
}
