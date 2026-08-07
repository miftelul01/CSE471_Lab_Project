import { JoinRequestList } from "./JoinRequestList";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { JoinRequest, Listing } from "@/lib/supabase/types";

export const metadata = { title: "Join requests — Smart Mess" };

/**
 * M1.2 — join requests (Mahia Tanzin).
 *
 * One query returns both "requests I sent" and "requests for my listings" —
 * the RLS policy decides which rows you're entitled to, so the split below is
 * purely presentational.
 */
export default async function JoinRequestsPage() {
  const user = await requireUser();
  const supabase = createClient();

  const { data } = await supabase
    .from("join_requests")
    .select("*, listings(*)")
    .order("created_at", { ascending: false });

  const requests = (data as (JoinRequest & { listings: Listing | null })[] | null) ?? [];
  const sent = requests.filter((r) => r.user_id === user.id);
  const received = requests.filter((r) => r.user_id !== user.id);

  return (
    <div className="space-y-8">
      <div>
        <PageHeader title="Requests I sent" />
        {sent.length === 0 ? (
          <EmptyState
            title="No requests sent"
            hint="Send one from your matches or saved listings."
          />
        ) : (
          <JoinRequestList requests={sent} viewer="applicant" />
        )}
      </div>

      {user.profile.role !== "RESIDENT" ? (
        <div>
          <PageHeader
            title="Requests for my listings"
            subtitle="Accepting a request is how you let someone into your house."
          />
          {received.length === 0 ? (
            <EmptyState title="No incoming requests" />
          ) : (
            <JoinRequestList requests={received} viewer="landlord" />
          )}
        </div>
      ) : null}
    </div>
  );
}
