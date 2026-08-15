import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "Smart Mess — shared-house management",
  description:
    "Listings, roommate matching, shared expenses, meals, chores and formal conflict resolution for shared houses.",
};

export const dynamic = "force-dynamic";

/**
 * Public landing page.
 *
 * The signed-out face of the product. Signed-in visitors are redirected to
 * their dashboard, so this page only ever renders one way — which also removes
 * the bug where, after signing out, the browser could still show a cached
 * "signed in" version of it.
 *
 * The figures in the stats band are read live from the database rather than
 * hardcoded — an empty database shows zeros, which is the honest thing for a
 * page that claims to describe the platform.
 */
export default async function LandingPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  const [expenseTotal, listingCount, houseCount, votingHours] = await Promise.all([
    prisma.expense.aggregate({ _sum: { amount: true } }),
    prisma.listing.count({ where: { isActive: true } }),
    prisma.house.count(),
    prisma.platformSetting.findUnique({ where: { key: "dispute_voting_hours" } }),
  ]);

  const tracked = Number(expenseTotal._sum.amount ?? 0);
  const hours = typeof votingHours?.value === "number" ? votingHours.value : 48;

  return (
    <div className="bg-canvas">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center sm:py-28">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Smart Mess &amp; Property Management
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            Every shared-house decision, recorded and settled fairly.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Find a room, split the bills, vote on the menu, rotate the chores — and when
            housemates disagree, settle it through a process nobody can quietly override.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            
                <Link
                  href="/login"
                  className="rounded-lg bg-brand-700 px-6 py-3 text-sm font-medium text-white transition hover:bg-brand-800"
                >
                  Create an account
                </Link>
                <Link
                  href="/login"
                  className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Sign in
                </Link>
              
          </div>

          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
            <li>Landlords, residents and administrators</li>
            <li aria-hidden className="text-slate-300">·</li>
            <li>Built for Dhaka shared housing</li>
          </ul>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 py-12 text-center sm:grid-cols-3">
          <Stat value={`৳${tracked.toLocaleString()}`} label="tracked in shared wallets" />
          <Stat value={`${hours} hours`} label="before a stalled dispute escalates" />
          <Stat value={`${listingCount} rooms`} label={`listed across ${houseCount} houses`} />
        </div>
      </section>

      {/* ── Modules ──────────────────────────────────────────────────────── */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Everything a shared house argues about
          </h2>
          <p className="mt-2 max-w-2xl text-slate-600">
            Seven areas, each with a clear record of who decided what and when.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {AREAS.map((area) => (
              <article
                key={area.title}
                className="rounded-xl border border-slate-200 bg-white p-6 transition hover:border-slate-300 hover:shadow-sm"
              >
                <h3 className="font-medium text-slate-900">{area.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{area.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm text-slate-500">
          <p>
            CSE471 System Analysis &amp; Design · BRAC University
            <span className="mx-2 text-slate-300">·</span>
            Miftelul Mehebub, Mahia Tanzin, Md. Mahidul Alam Araf
          </p>
          <Link href="/login" className="font-medium text-slate-700 hover:text-slate-900">
            Sign in →
          </Link>
        </div>
      </footer>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </div>
  );
}

const AREAS = [
  {
    title: "Rooms & listings",
    body: "Landlords post rooms with rent, area, type and amenities. Residents search and filter by budget and location, shortlist what fits, and apply.",
  },
  {
    title: "Roommate matching",
    body: "Set your budget and lifestyle once. A stable-matching pass ranks houses by compatibility so the same room is never promised to two people.",
  },
  {
    title: "Guest log",
    body: "Check guests in and out with a name, purpose and expected departure. The house admin is notified, and the log can't be quietly erased.",
  },
  {
    title: "Shared wallet",
    body: "Anyone adds an expense; it splits across the house into a per-person ledger showing exactly who has paid and who hasn't.",
  },
  {
    title: "Meals & menu",
    body: "Propose next week's menu and vote on it. Toggle attendance per meal — quantities recalculate for the cook, and skipped meals come off your share.",
  },
  {
    title: "Chores & calendar",
    body: "Weekly chores rotate automatically through the house and land in each person's Google Tasks. Rent dates and deadlines sync to a shared calendar.",
  },
  {
    title: "Mess Court",
    body: "Disputes follow a strict path — raised, voted on, resolved or escalated. Illegal shortcuts are refused by the database, not just the interface.",
  },
];
