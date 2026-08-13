import Link from "next/link";

import { Action, Heading, Panel, PrimaryLink, StatCard } from "./shared";
import { Badge } from "@/components/ui";
import { prisma } from "@/lib/prisma";

/**
 * The flat head runs one household.
 *
 * Their dashboard is about the flat as a whole — who owes the house money, who
 * wants to move in, what is unresolved — rather than their own share, which is
 * what an ordinary member sees.
 */
export async function FlatHeadDashboard({
  userId,
  name,
  houseId,
  houseName,
}: {
  userId: string;
  name: string;
  houseId: string;
  houseName: string;
}) {
  const [members, houseOwing, myShare, openTickets, guests, applicants, disputes] =
    await Promise.all([
      prisma.houseMember.findMany({
        where: { houseId, status: "ACTIVE" },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.expenseShare.aggregate({
        where: { status: "PENDING", expense: { houseId } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.expenseShare.aggregate({
        where: { status: "PENDING", userId },
        _sum: { amount: true },
      }),
      prisma.maintenanceTicket.count({
        where: { houseId, status: { in: ["OPEN", "IN_PROGRESS"] } },
      }),
      prisma.guestLog.count({ where: { houseId, status: "CHECKED_IN" } }),
      prisma.roommateApplication.findMany({
        where: { status: "PENDING", post: { houseId } },
        include: { user: { select: { name: true, email: true } }, post: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
      prisma.dispute.findMany({
        where: { houseId, state: { in: ["RAISED", "VOTING", "ESCALATED"] } },
        select: { id: true, title: true, state: true },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
    ]);

  const owed = Number(houseOwing._sum.amount ?? 0);
  const mine = Number(myShare._sum.amount ?? 0);

  return (
    <div className="space-y-6">
      <Heading
        name={name}
        role={`Flat head · ${houseName}`}
        context={`${members.length} living here. You run this flat — money, members and disputes come to you.`}
        actions={
          <>
            <Action href="/wallet" icon="wallet" label="House ledger" />
            <PrimaryLink href="/roommates/new" icon="match" label="Advertise a seat" />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="users"
          label="Members"
          value={String(members.length)}
          hint="Living in this flat"
        />
        <StatCard
          icon="wallet"
          label="Owed to the house"
          value={`৳${owed.toLocaleString()}`}
          hint={`${houseOwing._count} unpaid share${houseOwing._count === 1 ? "" : "s"} · ৳${mine.toLocaleString()} is yours`}
        />
        <StatCard
          icon="match"
          label="Wants to move in"
          value={String(applicants.length)}
          hint="Applicants for your spare seats"
        />
        <StatCard
          icon="wrench"
          label="Repairs & guests"
          value={`${openTickets} / ${guests}`}
          hint="Open tickets / guests in the flat"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Action href="/wallet" icon="wallet" label="Add a shared expense" />
        <Action href="/menu" icon="vote" label="Open menu voting" />
        <Action href="/chores" icon="rotate" label="Rotate chores" />
        <Action href="/guests" icon="guest" label="Log a guest" />
        <Action href="/mess-court" icon="gavel" label="Raise a case" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          icon="users"
          title="Who's in the flat"
          subtitle="You can pass the flat head role to any member"
        >
          <ul className="divide-y divide-slate-100 text-sm">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">
                    {member.user.name || member.user.email}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{member.user.email}</span>
                </span>
                {member.isHouseAdmin ? <Badge tone="brand">Flat head</Badge> : null}
              </li>
            ))}
          </ul>
          <Link
            href="/houses"
            className="mt-3 inline-block rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Manage members
          </Link>
        </Panel>

        <Panel icon="gavel" title="Open cases" subtitle="Disputes in this flat">
          {disputes.length === 0 ? (
            <p className="text-sm text-slate-600">Nothing open. A quiet house.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {disputes.map((dispute) => (
                <li key={dispute.id} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0 truncate text-slate-900">{dispute.title}</span>
                  <Badge tone={dispute.state === "ESCALATED" ? "red" : "amber"}>
                    {dispute.state.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {applicants.length > 0 ? (
        <Panel icon="match" title="People who want the spare seat" subtitle="You decide who moves in">
          <ul className="divide-y divide-slate-100 text-sm">
            {applicants.map((applicant) => (
              <li key={applicant.id} className="py-2.5">
                <span className="block font-medium text-slate-900">
                  {applicant.user.name || applicant.user.email}
                </span>
                <span className="block text-xs text-slate-500">for {applicant.post.title}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/roommates"
            className="mt-3 inline-block rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Review applicants
          </Link>
        </Panel>
      ) : null}
    </div>
  );
}
