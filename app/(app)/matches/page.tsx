import Link from "next/link";

import { MatchList } from "./MatchList";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Suggested matches — Smart Mess" };

/** another area — suggested houses/roommates (Mahia Tanzin). */
export default async function MatchesPage() {
  const user = await requireUser();
  const preference = await prisma.preference.findUnique({
    where: { userId: user.id },
    select: { userId: true },
  });

  if (!preference) {
    return (
      <div>
        <PageHeader title="Suggested matches" />
        <EmptyState
          title="Set your preferences first"
          hint={
            <>
              The engine needs your budget and lifestyle before it can rank houses.{" "}
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
        title="Suggested matches"
        subtitle="Ranked by compatibility, then resolved with a stable-matching pass so the same room is not promised to two people."
        action={
          <div className="flex gap-4 text-sm">
            <Link href="/preferences" className="text-slate-600 underline hover:text-slate-900">
              Preferences
            </Link>
            <Link href="/favorites" className="text-slate-600 underline hover:text-slate-900">
              Saved
            </Link>
            <Link href="/join-requests" className="text-slate-600 underline hover:text-slate-900">
              Join requests
            </Link>
          </div>
        }
      />
      <div className="mb-4 flex gap-2 border-b border-slate-200">
        <span className="border-b-2 border-brand-700 px-3 pb-2 text-sm font-medium text-brand-700">
          Rooms
        </span>
        <Link
          href="/matches/people"
          className="px-3 pb-2 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          People
        </Link>
      </div>
      <MatchList />
    </div>
  );
}
