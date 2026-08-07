import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { House, HouseMember, User, UserRole } from "@prisma/client";

/**
 * Session helpers used by every page and route handler.
 *
 * Same shape as before the Prisma migration, so feature code that used
 * requireUser()/getActiveHouseId() didn't need to change when the auth
 * provider did.
 */

export type SessionUser = {
  id: string;
  email: string;
  /** Full row, for pages that need phone, emergency contacts, etc. */
  profile: User;
};

/** Current user, or null when signed out. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  // The JWT carries id and role, but pages want the whole row, and reading it
  // fresh means a profile edit shows up immediately rather than at token
  // refresh.
  const profile = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!profile) return null;

  return { id: profile.id, email: profile.email, profile };
}

/** Same, but redirects to /login when signed out. Use in pages. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Redirects unless the user holds one of `roles`. */
export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.profile.role)) redirect("/");
  return user;
}

export type MembershipWithHouse = HouseMember & { house: House };

/** Every house the user actively belongs to. */
export async function getMyHouses(userId: string): Promise<MembershipWithHouse[]> {
  return prisma.houseMember.findMany({
    where: { userId, status: "ACTIVE" },
    include: { house: true },
    orderBy: { joinedAt: "asc" },
  });
}

/**
 * The house a page should show data for. Most features are scoped to one
 * house; until a house-switcher exists, "first active membership" is the
 * agreed convention. Null when the user hasn't joined one.
 */
export async function getActiveHouseId(userId: string): Promise<string | null> {
  const membership = await prisma.houseMember.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { joinedAt: "asc" },
    select: { houseId: true },
  });
  return membership?.houseId ?? null;
}
