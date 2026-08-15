import { prisma } from "@/lib/prisma";

/**
 * Platform-wide monitoring for the admin console.
 *
 * Every caller must have passed requireRole("ADMIN") or withAdmin() first:
 * these counts deliberately span every house, which no ordinary user should
 * ever see. Under Supabase that required the service-role client to escape Row
 * Level Security; with Prisma there is nothing to escape, so the role check by
 * the caller is the only protection.
 */

export type PlatformStats = {
  users: { total: number; residents: number; landlords: number; admins: number };
  houses: number;
  listings: { total: number; active: number; delisted: number };
  joinRequests: { total: number; pending: number };
  disputes: { total: number; escalated: number; open: number };
  maintenance: { total: number; open: number };
  money: { expenses: number; outstandingShares: number; payments: number };
};

export async function getPlatformStats(): Promise<PlatformStats> {
  const [
    users, residents, landlords, admins,
    houses, listingsTotal, listingsActive,
    joinTotal, joinPending,
    disputesTotal, disputesEscalated, disputesOpen,
    ticketsTotal, ticketsOpen,
    expenses, outstanding, payments,
  ] = await prisma.$transaction([
    prisma.user.count(),
    prisma.user.count({ where: { role: "RESIDENT" } }),
    prisma.user.count({ where: { role: "LANDLORD" } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.house.count(),
    prisma.listing.count(),
    prisma.listing.count({ where: { isActive: true } }),
    prisma.joinRequest.count(),
    prisma.joinRequest.count({ where: { status: "PENDING" } }),
    prisma.dispute.count(),
    prisma.dispute.count({ where: { state: "ESCALATED" } }),
    prisma.dispute.count({ where: { state: { in: ["RAISED", "VOTING"] } } }),
    prisma.maintenanceTicket.count(),
    prisma.maintenanceTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.expense.count(),
    prisma.expenseShare.count({ where: { status: "PENDING" } }),
    prisma.payment.count(),
  ]);

  return {
    users: { total: users, residents, landlords, admins },
    houses,
    listings: { total: listingsTotal, active: listingsActive, delisted: listingsTotal - listingsActive },
    joinRequests: { total: joinTotal, pending: joinPending },
    disputes: { total: disputesTotal, escalated: disputesEscalated, open: disputesOpen },
    maintenance: { total: ticketsTotal, open: ticketsOpen },
    money: { expenses, outstandingShares: outstanding, payments },
  };
}
