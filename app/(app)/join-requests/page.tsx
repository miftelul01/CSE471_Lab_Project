import { JoinRequestList } from "./JoinRequestList";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { joinRequestVisibilityFilter } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Join requests — Smart Mess" };

/**
 * another area — join requests (Mahia Tanzin).
 *
 * One query returns both "requests I sent" and "requests for my listings" —
 * the visibility filter decides which rows you are entitled to, so the split
 * below is purely presentational.
 */
export default async function JoinRequestsPage() {
  const user = await requireUser();

  const requests = await prisma.joinRequest.findMany({
    where: joinRequestVisibilityFilter(user),
    include: { listing: true },
    orderBy: { createdAt: "desc" },
  });

  const toRow = (r: (typeof requests)[number]) => ({
    id: r.id,
    status: r.status,
    message: r.message,
    listing: r.listing && {
      title: r.listing.title,
      area: r.listing.area,
      rent: Number(r.listing.rent),
    },
  });

  const sent = requests.filter((r) => r.userId === user.id).map(toRow);
  const received = requests.filter((r) => r.userId !== user.id).map(toRow);

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
