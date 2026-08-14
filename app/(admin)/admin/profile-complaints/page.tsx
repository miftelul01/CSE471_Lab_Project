import { ProfileComplaintsTable } from "./ProfileComplaintsTable";
import { EmptyState, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Profile complaints — Administration" };

/**
 * M1.2 — Post-Move-In Feedback Window, admin review (Mahia Tanzin).
 * Upheld complaints apply a match-rating penalty to the subject's future
 * compatibility scores — see PATCH /api/admin/disputes/uphold.
 */
export default async function AdminProfileComplaintsPage() {
  const complaints = await prisma.dispute.findMany({
    where: { category: "PROFILE_DISHONESTY" },
    include: {
      house: { select: { name: true } },
      raisedBy: { select: { name: true, email: true } },
      againstUser: { select: { id: true, name: true, email: true, matchRatingPenalty: true } },
    },
    orderBy: [{ state: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div>
      <PageHeader
        title="Profile complaints"
        subtitle="Filed by an existing housemate within 14 days of a new resident moving in, when reality doesn't match their stated preferences. Upholding one dents the subject's future match scores."
      />
      {complaints.length === 0 ? (
        <EmptyState title="No profile complaints" hint="Nothing filed yet." />
      ) : (
        <ProfileComplaintsTable
          complaints={complaints.map((c) => ({
            id: c.id,
            title: c.title,
            description: c.description,
            state: c.state,
            houseName: c.house.name,
            raisedByName: c.raisedBy.name || c.raisedBy.email,
            subject: c.againstUser
              ? {
                  id: c.againstUser.id,
                  name: c.againstUser.name || c.againstUser.email,
                  matchRatingPenalty: c.againstUser.matchRatingPenalty,
                }
              : null,
            resolution: c.resolution,
          }))}
        />
      )}
    </div>
  );
}
