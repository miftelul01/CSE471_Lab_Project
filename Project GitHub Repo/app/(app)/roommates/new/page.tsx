import { redirect } from "next/navigation";

import { RoommatePostForm } from "./RoommatePostForm";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Advertise a seat — Smart Mess" };

/**
 * Only a flat admin can advertise a spare seat, so the form is scoped to the
 * houses this user actually runs. If they run none, there is nothing to post.
 */
export default async function NewRoommatePostPage() {
  const user = await requireUser();

  const memberships = await prisma.houseMember.findMany({
    where: { userId: user.id, status: "ACTIVE", isHouseAdmin: true },
    include: { house: { select: { id: true, name: true, area: true } } },
  });

  if (memberships.length === 0) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Advertise a spare seat" />
        <EmptyState
          title="You don't run a flat yet"
          hint="The first resident to join a house becomes its flat admin, and only they can invite someone into the household."
        />
      </div>
    );
  }

  // A landlord who owns houses but lives in none shouldn't end up here.
  if (user.profile.role === "ADMIN") redirect("/admin");

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Advertise a spare seat"
        subtitle="This invites someone into your household. You decide who is accepted."
      />
      <RoommatePostForm houses={memberships.map((m) => m.house)} />
    </div>
  );
}
