import Link from "next/link";

import { Badge, Card, PageHeader } from "@/components/ui";
import { getPlatformStats } from "@/lib/admin";

export const metadata = { title: "Admin — Smart Mess" };

/** Common Workflow 2 — platform monitoring. */
export default async function AdminOverviewPage() {
  // The admin layout has already enforced the ADMIN role, which is what makes
  // the service-role reads inside getPlatformStats safe.
  const stats = await getPlatformStats();

  return (
    <div>
      <PageHeader
        title="Platform overview"
        subtitle="System-wide counts across every house. Everything here reads past the per-house boundaries residents are limited to."
        action={
          stats.disputes.escalated > 0 ? (
            <Link href="/admin/disputes">
              <Badge tone="red">
                {stats.disputes.escalated} escalated dispute
                {stats.disputes.escalated === 1 ? "" : "s"} need attention
              </Badge>
            </Link>
          ) : (
            <Badge tone="green">Nothing escalated</Badge>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Users"
          primary={stats.users.total}
          rows={[
            ["Residents", stats.users.residents],
            ["Landlords", stats.users.landlords],
            ["Admins", stats.users.admins],
          ]}
        />
        <StatCard
          title="Listings"
          primary={stats.listings.total}
          rows={[
            ["Active", stats.listings.active],
            ["Delisted", stats.listings.delisted],
          ]}
        />
        <StatCard title="Houses" primary={stats.houses} rows={[]} />
        <StatCard
          title="Join requests"
          primary={stats.joinRequests.total}
          rows={[["Pending", stats.joinRequests.pending]]}
        />
        <StatCard
          title="Mess Court"
          primary={stats.disputes.total}
          rows={[
            ["Open", stats.disputes.open],
            ["Escalated to you", stats.disputes.escalated],
          ]}
        />
        <StatCard
          title="Maintenance"
          primary={stats.maintenance.total}
          rows={[["Unresolved", stats.maintenance.open]]}
        />
        <StatCard
          title="Shared wallet"
          primary={stats.money.expenses}
          rows={[
            ["Unpaid shares", stats.money.outstandingShares],
            ["Payments", stats.money.payments],
          ]}
        />
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Counts covering features that are still being built will read zero until their owner ships
        them — see the dashboard for build status.
      </p>
    </div>
  );
}

function StatCard({
  title,
  primary,
  rows,
}: {
  title: string;
  primary: number;
  rows: [string, number][];
}) {
  return (
    <Card>
      <h2 className="text-sm font-medium text-slate-500">{title}</h2>
      <p className="mt-1 text-3xl font-semibold text-slate-900">{primary.toLocaleString()}</p>
      {rows.length > 0 ? (
        <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <dt className="text-slate-500">{label}</dt>
              <dd className="font-medium text-slate-900">{value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Card>
  );
}
