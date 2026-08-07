import Link from "next/link";

import { Badge, Card, PageHeader } from "@/components/ui";
import { getMyHouses, requireUser } from "@/lib/auth";
import { FEATURES, MODULE_NAMES, type Feature } from "@/lib/features";

/**
 * Dashboard + team board. Shows which house you're in and the live build
 * status of all nine features, read straight out of lib/features.ts.
 */
export default async function HomePage() {
  const user = await requireUser();
  const houses = await getMyHouses(user.id);

  const done = FEATURES.filter((f) => f.status === "done").length;
  const modules: Feature["module"][] = [0, 1, 2, 3];

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.profile.full_name || user.email}`}
        subtitle={
          houses.length > 0 ? (
            <>
              You&apos;re in <strong>{houses[0].houses?.name}</strong>
              {houses.length > 1 ? ` (+${houses.length - 1} more)` : ""}. Most features below are
              scoped to this house.
            </>
          ) : (
            <>
              You haven&apos;t joined a house yet — most features need one.{" "}
              <Link href="/houses" className="font-medium text-slate-900 underline">
                Create or join a house
              </Link>
              .
            </>
          )
        }
        action={
          <Badge tone={done === FEATURES.length ? "green" : "slate"}>
            {done} / {FEATURES.length} features built
          </Badge>
        }
      />

      <div className="space-y-6">
        {modules.map((module) => (
          <section key={module}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {MODULE_NAMES[module]}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.filter((f) => f.module === module).map((feature) => (
                <Link key={feature.id} href={feature.href} className="block">
                  <Card className="h-full transition hover:border-slate-400">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <span className="font-mono text-xs text-slate-400">{feature.id}</span>
                      <StatusBadge status={feature.status} />
                    </div>
                    <h3 className="font-medium text-slate-900">{feature.title}</h3>
                    <p className="mt-1 text-xs text-slate-500">{feature.owner}</p>
                    <p className="mt-2 line-clamp-3 text-sm text-slate-600">{feature.summary}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Feature["status"] }) {
  if (status === "done") return <Badge tone="green">Built</Badge>;
  if (status === "in-progress") return <Badge tone="blue">In progress</Badge>;
  return <Badge tone="amber">To do</Badge>;
}
