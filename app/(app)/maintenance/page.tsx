import { ReportTicketForm } from "./ReportTicketForm";
import { TicketBoard } from "./TicketBoard";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getActiveHouseId, requireUser } from "@/lib/auth";
import { isHouseAdmin, isPlatformAdmin } from "@/lib/authz";
import {
  TICKET_INCLUDE,
  TICKET_STATUS_LABELS,
  countByStatus,
  sortForBoard,
  toTicketView,
} from "@/lib/maintenance";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Maintenance — Smart Mess" };
export const dynamic = "force-dynamic";

/**
 * M3.1 Maintenance Ticket System — Miftelul Mehebub.
 *
 * Residents report a problem; the landlord or house admin drives it through
 * OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED; every move is kept as a history
 * row so the house can see what was done and when.
 *
 * Who may do what is decided here as well as in the API. The board hides
 * controls the route would refuse, so nobody is offered a button that returns
 * 403 — but the API never trusts that, because hiding a control is a courtesy
 * and not a permission check.
 */
export default async function MaintenancePage() {
  const user = await requireUser();
  const houseId = await getActiveHouseId(user.id);

  if (!houseId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Maintenance" subtitle="Report problems and track repairs." />
        <EmptyState
          title="You're not in a house yet"
          hint="Join or create a house first — maintenance tickets belong to a property."
        />
      </div>
    );
  }

  const [rows, houseAdmin, members] = await Promise.all([
    prisma.maintenanceTicket.findMany({
      where: { houseId },
      include: TICKET_INCLUDE,
      orderBy: { createdAt: "desc" },
    }),
    isHouseAdmin(user.id, houseId),
    prisma.houseMember.findMany({
      where: { houseId, status: "ACTIVE" },
      select: { userId: true, user: { select: { name: true } } },
    }),
  ]);

  const tickets = sortForBoard(rows.map(toTicketView));
  const counts = countByStatus(tickets);
  const canManage = houseAdmin || isPlatformAdmin(user);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maintenance"
        subtitle="Report a problem once. The house sees it, the landlord moves it along, and the history stays."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        {(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const).map((status) => (
          <Card key={status}>
            <p className="text-sm text-slate-600">{TICKET_STATUS_LABELS[status]}</p>
            <p className="tabular mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              {counts[status]}
            </p>
          </Card>
        ))}
      </div>

      <ReportTicketForm />

      {tickets.length === 0 ? (
        <EmptyState
          title="Nothing reported yet"
          hint="When something breaks, report it above so there's a record of when it started."
        />
      ) : (
        <TicketBoard
          tickets={tickets}
          currentUserId={user.id}
          canManage={canManage}
          members={members.map((member) => ({
            id: member.userId,
            name: member.user.name ?? "Unnamed housemate",
          }))}
        />
      )}
    </div>
  );
}
