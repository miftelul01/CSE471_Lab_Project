import Link from "next/link";

import { PeopleMatchList } from "./PeopleMatchList";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Find roommates — Smart Mess" };

/** M1.2 — User <-> User roommate matching (Mahia Tanzin). */
export default async function PeopleMatchesPage() {
  const user = await requireUser();
  const preference = await prisma.preference.findUnique({
    where: { userId: user.id },
    select: { userId: true },
  });

  if (!preference) {
    return (
      <div>
        <PageHeader title="Find roommates" />
        <EmptyState
          title="Set your preferences first"
          hint={
            <>
              The engine needs your budget and lifestyle before it can suggest people.{" "}
              <Link href="/preferences" className="underline">
                Fill in your preferences
              </Link>
              .
            </>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Find roommates"
        subtitle="Matched directly with other residents, independent of any specific listing. Contact info stays hidden until you both accept a request."
      />

      <div className="mb-4 flex gap-2 border-b border-slate-200">
        <Link
          href="/matches"
          className="px-3 pb-2 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          Rooms
        </Link>
        <span className="border-b-2 border-brand-700 px-3 pb-2 text-sm font-medium text-brand-700">
          People
        </span>
      </div>

      <PeopleMatchList />
    </div>
  );
}
