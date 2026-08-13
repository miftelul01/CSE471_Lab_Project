import Link from "next/link";

import { Action, Heading, Panel, PrimaryLink, StatCard } from "./shared";
import { Badge, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";

/**
 * A member lives in a flat but doesn't run it.
 *
 * Everything here is "mine": my share of the bills, my chores, my
 * applications. House-wide totals and the levers to run the place belong to
 * the flat head.
 */
export async function MemberDashboard({
  userId,
  name,
  houseId,
  houseName,
}: {
  userId: string;
  name: string;
  houseId: string | null;
  houseName: string | null;
}) {
  const [owing, unpaidShares, myChores, myApplications, myRoommateApplications, openDispute] =
    await Promise.all([
      prisma.expenseShare.aggregate({
        where: { userId, status: "PENDING" },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.expenseShare.findMany({
        where: { userId, status: "PENDING" },
        include: { expense: { select: { title: true, spentOn: true } } },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
      prisma.choreAssignment.findMany({
        where: { userId, status: "PENDING" },
        include: { chore: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
        take: 3,
      }),
      prisma.joinRequest.findMany({
        where: { userId, status: "PENDING" },
        include: { listing: { select: { title: true } } },
        take: 3,
      }),
      prisma.roommateApplication.findMany({
        where: { userId, status: "PENDING" },
        include: { post: { select: { title: true } } },
        take: 3,
      }),
      houseId
        ? prisma.dispute.findFirst({
            where: { houseId, state: { in: ["VOTING", "ESCALATED"] } },
            select: { id: true, title: true, state: true },
          })
        : null,
    ]);

  const owed = Number(owing._sum.amount ?? 0);
  const applications = myApplications.length + myRoommateApplications.length;

  // Someone with no flat yet is really still house-hunting.
  if (!houseId) {
    return (
      <div className="space-y-6">
        <Heading
          name={name}
          role="Resident"
          context="You're not in a flat yet. Find a room to rent, or take a spare seat in a shared flat."
          actions={<PrimaryLink href="/listings" icon="search" label="Find a room" />}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Panel icon="search" title="Rooms to rent" subtitle="Posted by landlords">
            <p className="text-sm text-slate-600">
              Whole rooms and flats let directly by their owner.
            </p>
            <Link
              href="/listings"
              className="mt-3 inline-block rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Browse rooms
            </Link>
          </Panel>

          <Panel icon="guest" title="Spare seats in shared flats" subtitle="Posted by the people living there">
            <p className="text-sm text-slate-600">
              Join an existing household — the flat head decides who moves in.
            </p>
            <Link
              href="/roommates"
              className="mt-3 inline-block rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Browse spare seats
            </Link>
          </Panel>
        </div>

        {applications > 0 ? (
          <Panel icon="users" title="Your applications" subtitle={`${applications} waiting on a decision`}>
            <ul className="divide-y divide-slate-100 text-sm">
              {myApplications.map((a) => (
                <li key={a.id} className="py-2.5 text-slate-900">
                  {a.listing.title} <span className="text-xs text-slate-500">· to rent</span>
                </li>
              ))}
              {myRoommateApplications.map((a) => (
                <li key={a.id} className="py-2.5 text-slate-900">
                  {a.post.title} <span className="text-xs text-slate-500">· spare seat</span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Heading
        name={name}
        role={`Resident · ${houseName}`}
        context="What you personally owe, owe time to, or are waiting on."
        actions={
          <>
            <Action href="/wallet" icon="wallet" label="My share" />
            <PrimaryLink href="/payments" icon="card" label={`Pay ৳${owed.toLocaleString()}`} />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="wallet"
          label="You owe"
          value={`৳${owed.toLocaleString()}`}
          hint={`${owing._count} unpaid share${owing._count === 1 ? "" : "s"}`}
        />
        <StatCard
          icon="rotate"
          label="Your chores"
          value={String(myChores.length)}
          hint={myChores[0] ? `Next: ${myChores[0].chore.name}` : "Nothing assigned"}
        />
        <StatCard
          icon="meal"
          label="Meals today"
          value="—"
          hint="Set your attendance for the day"
        />
        <StatCard
          icon="users"
          label="Your applications"
          value={String(applications)}
          hint="Awaiting a decision"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Action href="/payments" icon="card" label="Pay my share" />
        <Action href="/meals" icon="meal" label="Toggle my meals" />
        <Action href="/chores" icon="rotate" label="My chores" />
        <Action href="/guests" icon="guest" label="Log a guest" />
        <Action href="/maintenance" icon="wrench" label="Report a repair" />
      </div>

      {openDispute ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm text-amber-900">
            <span className="font-medium">{openDispute.title}</span> — your flat is voting on this.
          </p>
          <Link
            href="/mess-court"
            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
          >
            Cast your vote
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel icon="wallet" title="What you owe" subtitle="Your share of the house bills">
          {unpaidShares.length === 0 ? (
            <EmptyState title="You're square with the house" />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {unpaidShares.map((share) => (
                <li key={share.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-slate-900">{share.expense.title}</span>
                    <span className="block text-xs text-slate-500">
                      {share.expense.spentOn.toLocaleDateString("en-GB", { dateStyle: "medium" })}
                    </span>
                  </span>
                  <span className="tabular shrink-0 font-medium text-slate-900">
                    ৳{Number(share.amount).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon="rotate" title="Your chores" subtitle="Assigned to you this rotation">
          {myChores.length === 0 ? (
            <EmptyState title="Nothing assigned to you" />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {myChores.map((assignment) => (
                <li key={assignment.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="truncate text-slate-900">{assignment.chore.name}</span>
                  <Badge tone="amber">
                    due {assignment.dueDate.toLocaleDateString("en-GB", { dateStyle: "medium" })}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
