import { HouseManager } from "./HouseManager";
import { ProfileComplaintButton } from "./ProfileComplaintButton";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { getMyHouses, requireUser } from "@/lib/auth";
import { isVerificationWindowOpen } from "@/lib/moveIn";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "My houses — Smart Mess" };

/**
 * Common Workflow 2 — house membership.
 *
 * Every other feature scopes its data by house, so this page is the entry
 * point for the whole app: no house, nothing to manage.
 */
export default async function HousesPage() {
  const user = await requireUser();
  const memberships = await getMyHouses(user.id);

  // Requests sent via "Request to join a house" that a house admin hasn't
  // approved yet — status PENDING grants no access, so this is the only place
  // that confirms the request actually went somewhere.
  const pendingRequests = await prisma.houseMember.findMany({
    where: { userId: user.id, status: "PENDING" },
    include: { house: { select: { name: true } } },
  });

  // Housemates for the primary house, so people can see who they share with.
  const housemates = memberships[0]
    ? await prisma.houseMember.findMany({
        where: { houseId: memberships[0].houseId, status: "ACTIVE" },
        include: { user: { select: { id: true, name: true, email: true } } },
      })
    : [];

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="My houses"
        subtitle="Create a house if you're a landlord, or join one with the id your house admin shares with you."
      />

      <div className="space-y-4">
        {memberships.length === 0 ? (
          <EmptyState
            title="You're not in a house yet"
            hint="Create one below, or paste a house id to join."
          />
        ) : (
          memberships.map((membership) => (
            <Card key={membership.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium text-slate-900">{membership.house.name}</h2>
                  <p className="text-sm text-slate-600">{membership.house.address}</p>
                </div>
                {membership.isHouseAdmin ? <Badge tone="blue">House admin</Badge> : null}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                House id (share this so people can join):{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                  {membership.houseId}
                </code>
              </p>
            </Card>
          ))
        )}

        {pendingRequests.length > 0 ? (
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Pending requests</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {pendingRequests.map((request) => (
                <li key={request.id} className="flex items-center justify-between py-2">
                  <span>{request.house.name}</span>
                  <Badge tone="amber">Awaiting approval</Badge>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {housemates.length > 0 ? (
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Housemates</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {housemates.map((member) => {
                // Post-Move-In Feedback Window: only a housemate who was
                // already living there before this person moved in, and only
                // while their 14-day window is still open.
                const eligible =
                  member.userId !== user.id &&
                  memberships[0] &&
                  memberships[0].joinedAt < member.joinedAt &&
                  isVerificationWindowOpen(member.joinedAt);
                return (
                  <li key={member.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="flex items-center gap-2">
                      <span>{member.user.name || member.user.email}</span>
                      {member.isHouseAdmin ? <Badge tone="blue">Admin</Badge> : null}
                    </div>
                    {eligible ? (
                      <ProfileComplaintButton
                        subjectUserId={member.userId}
                        subjectName={member.user.name || member.user.email}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}

        <HouseManager canCreate={user.profile.role !== "RESIDENT"} />
      </div>
    </div>
  );
}
