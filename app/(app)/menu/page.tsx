import { MenuBoard } from "./MenuBoard";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { getActiveHouseId, requireUser } from "@/lib/auth";
import { isHouseAdmin } from "@/lib/authz";
import { mondayOf } from "@/lib/menu";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Weekly menu — Smart Mess" };

/** M2.2 Weekly Menu Proposal & Voting System — Mahia Tanzin. */
export default async function MenuPage() {
  const user = await requireUser();
  const houseId = await getActiveHouseId(user.id);

  if (!houseId) {
    return (
      <div>
        <PageHeader
          title="Weekly menu"
          subtitle="Propose meal plans and vote as a house. The highest-voted plan becomes the official menu."
        />
        <EmptyState
          title="Join a house to use menu voting"
          hint="Go to the Houses page to create or join a house first."
        />
      </div>
    );
  }

  const [proposals, canClose] = await Promise.all([
    prisma.menuProposal.findMany({
      where: { houseId },
      include: {
        items: true,
        votes: { select: { userId: true, vote: true } },
        proposedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ weekStartDate: "desc" }, { createdAt: "asc" }],
    }),
    isHouseAdmin(user.id, houseId),
  ]);

  // `proposals` is sorted by week descending, so simply taking the first
  // APPROVED row returns whichever week is furthest in the future — and then
  // labels it "this week's". Pick the current week explicitly, and fall back to
  // the nearest upcoming one only when this week has not been decided yet.
  const thisMonday = mondayOf(new Date()).getTime();
  const approved = proposals.filter((p) => p.status === "APPROVED");

  const currentMenu = approved.find((p) => p.weekStartDate.getTime() === thisMonday) ?? null;
  const upcomingMenu = currentMenu
    ? null
    : ([...approved].reverse().find((p) => p.weekStartDate.getTime() > thisMonday) ?? null);

  const openProposals = proposals.filter((p) => p.status === "OPEN");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Weekly menu"
        subtitle="Propose meal plans and vote as a house. The highest-voted plan becomes the official menu."
        action={<LinkButton href="/menu/new">Propose a menu</LinkButton>}
      />

      <MenuBoard
        approvedMenu={currentMenu ?? upcomingMenu}
        approvedIsThisWeek={Boolean(currentMenu)}
        openProposals={openProposals}
        currentUserId={user.id}
        canCloseVoting={canClose}
      />
    </div>
  );
}
