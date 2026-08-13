import Link from "next/link";

import { Icon } from "@/components/Icon";
import { getPlatformStats } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import type { IconName } from "@/lib/navigation";

export const metadata = { title: "Administration — Smart Mess" };

/**
 * Platform monitoring.
 *
 * The ADMIN role is already enforced by the layout, which is what makes these
 * cross-house reads legitimate — no ordinary user should ever see totals that
 * span houses they do not belong to.
 */
export default async function AdminOverviewPage() {
  const [stats, recentUsers, busiestHouses] = await Promise.all([
    getPlatformStats(),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
    prisma.house.findMany({
      take: 5,
      orderBy: { members: { _count: "desc" } },
      select: {
        id: true,
        name: true,
        area: true,
        _count: { select: { members: true, listings: true, disputes: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      {stats.disputes.escalated > 0 ? (
        <Link
          href="/admin/disputes"
          className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 transition hover:border-amber-300"
        >
          <span className="text-sm text-amber-900">
            <span className="font-medium">
              {stats.disputes.escalated} case{stats.disputes.escalated === 1 ? "" : "s"} escalated
            </span>{" "}
            — a house could not settle this itself and it is waiting on you.
          </span>
          <span className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900">
            Review
          </span>
        </Link>
      ) : (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm text-brand-800">
          Nothing escalated. Every dispute is being handled inside its own house.
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          People
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon="users" label="Total accounts" value={stats.users.total} />
          <Metric icon="users" label="Residents" value={stats.users.residents} />
          <Metric icon="building" label="Landlords" value={stats.users.landlords} />
          <Metric icon="shield" label="Administrators" value={stats.users.admins} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Housing
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon="building" label="Houses" value={stats.houses} />
          <Metric
            icon="search"
            label="Rooms listed"
            value={stats.listings.active}
            hint={`${stats.listings.delisted} delisted`}
          />
          <Metric
            icon="users"
            label="Join requests"
            value={stats.joinRequests.total}
            hint={`${stats.joinRequests.pending} pending`}
          />
          <Metric
            icon="wrench"
            label="Maintenance"
            value={stats.maintenance.total}
            hint={`${stats.maintenance.open} unresolved`}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Money &amp; governance
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon="wallet" label="Shared expenses" value={stats.money.expenses} />
          <Metric
            icon="card"
            label="Unpaid shares"
            value={stats.money.outstandingShares}
            hint={`${stats.money.payments} payments recorded`}
          />
          <Metric
            icon="gavel"
            label="Disputes"
            value={stats.disputes.total}
            hint={`${stats.disputes.open} in progress`}
          />
          <Metric icon="gavel" label="Escalated to you" value={stats.disputes.escalated} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Newest accounts" action={{ href: "/admin/users", label: "Manage roles" }}>
          <ul className="divide-y divide-slate-100 text-sm">
            {recentUsers.map((person) => (
              <li key={person.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">
                    {person.name || person.email}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{person.email}</span>
                </span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">
                  {person.role.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Largest houses">
          {busiestHouses.length === 0 ? (
            <p className="text-sm text-slate-600">No houses yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {busiestHouses.map((house) => (
                <li key={house.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">{house.name}</span>
                    <span className="block text-xs text-slate-500">{house.area ?? "—"}</span>
                  </span>
                  <span className="tabular shrink-0 text-xs text-slate-500">
                    {house._count.members} members · {house._count.listings} rooms
                    {house._count.disputes > 0 ? ` · ${house._count.disputes} disputes` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <p className="text-xs text-slate-500">
        Areas still being built report zero until their features ship.
      </p>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
}: {
  icon: IconName;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between">
        <p className="text-sm text-slate-600">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      <p className="tabular mt-3 text-3xl font-semibold tracking-tight text-slate-900">
        {value.toLocaleString()}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {action ? (
          <Link href={action.href} className="text-xs font-medium text-brand-700 hover:underline">
            {action.label} →
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
