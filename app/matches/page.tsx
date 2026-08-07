import Link from "next/link";

import { MatchList } from "./MatchList";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Suggested matches — Smart Mess" };

/** M1.2 — suggested houses/roommates (Mahia Tanzin). */
export default async function MatchesPage() {
  const user = await requireUser();
  const supabase = createClient();

  const { data: preference } = await supabase
    .from("preferences")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

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
        subtitle="Ranked by compatibility, then resolved with a stable-matching pass so two people don't both get promised the same room."
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
      <MatchList />
    </div>
  );
}
