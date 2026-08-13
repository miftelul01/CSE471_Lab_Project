import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

/**
 * Authorization layer.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * The database used to enforce access control itself, with Row Level Security
 * policies attached to every table. Prisma connects as a single database user
 * and has no notion of "the current end user", so RLS can no longer apply.
 * Every rule those policies expressed now lives here, and every query that
 * reads or writes another user's data MUST go through one of these helpers.
 *
 * The danger with this change is silence: forget a check and nothing breaks,
 * nothing errors — the data is simply exposed. So the rules are gathered in one
 * file rather than scattered inline, and each one names the policy it replaces.
 *
 * Two kinds of helper:
 *   *Filter()  -> a Prisma `where` fragment, for reads. Mirrors a USING clause.
 *   assert*()  -> throws AuthzError, for writes. Mirrors a WITH CHECK clause.
 * ────────────────────────────────────────────────────────────────────────────
 */

export class AuthzError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 = 403
  ) {
    super(message);
    this.name = "AuthzError";
  }
}

export const isPlatformAdmin = (user: SessionUser) => user.profile.role === "ADMIN";
export const isLandlordRole = (user: SessionUser) => user.profile.role !== "RESIDENT";

/** Replaces the SECURITY DEFINER function public.is_house_member(). */
export async function isHouseMember(userId: string, houseId: string): Promise<boolean> {
  const membership = await prisma.houseMember.findFirst({
    where: { houseId, userId, status: "ACTIVE" },
    select: { id: true },
  });
  return membership !== null;
}

/**
 * Replaces public.is_house_admin(): an active member flagged as house admin,
 * OR the landlord who owns the house.
 */
export async function isHouseAdmin(userId: string, houseId: string): Promise<boolean> {
  const [membership, house] = await Promise.all([
    prisma.houseMember.findFirst({
      where: { houseId, userId, status: "ACTIVE", isHouseAdmin: true },
      select: { id: true },
    }),
    prisma.house.findFirst({ where: { id: houseId, landlordId: userId }, select: { id: true } }),
  ]);
  return membership !== null || house !== null;
}

/* ── Houses ─────────────────────────────────────────────────────────────── */

/** Policy "house visible to members and landlord". */
export function houseVisibilityFilter(user: SessionUser): Prisma.HouseWhereInput {
  if (isPlatformAdmin(user)) return {};
  return {
    OR: [
      { members: { some: { userId: user.id, status: "ACTIVE" } } },
      { landlordId: user.id },
    ],
  };
}

/** Policy "house admins update house". */
export async function assertCanManageHouse(user: SessionUser, houseId: string) {
  if (isPlatformAdmin(user)) return;
  if (!(await isHouseAdmin(user.id, houseId))) {
    throw new AuthzError("You don't administer that house.");
  }
}

/** Anything scoped to a house you live in — expenses, meals, tickets, disputes. */
export async function assertHouseMember(user: SessionUser, houseId: string) {
  if (isPlatformAdmin(user)) return;
  if (!(await isHouseMember(user.id, houseId))) {
    throw new AuthzError("You're not a member of that house.");
  }
}

/* ── Listings (M1.1) ────────────────────────────────────────────────────── */

/**
 * Policy "active listings are browsable": everyone sees active listings; a
 * landlord additionally sees their own delisted ones.
 */
export function listingVisibilityFilter(user: SessionUser): Prisma.ListingWhereInput {
  if (isPlatformAdmin(user)) return {};
  return { OR: [{ isActive: true }, { landlordId: user.id }] };
}

/** Policies "landlords update/delete own listings". */
export async function assertCanEditListing(user: SessionUser, listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { landlordId: true },
  });
  if (!listing) throw new AuthzError("No such listing", 404);
  if (isPlatformAdmin(user)) return;
  if (listing.landlordId !== user.id) {
    throw new AuthzError("That listing belongs to another landlord.");
  }
}

/** Policy "landlords create own listings" (plus the role gate the UI shows). */
export function assertCanCreateListing(user: SessionUser) {
  if (!isLandlordRole(user)) {
    throw new AuthzError(
      "Only landlords can post listings. Switch your role on the profile page first."
    );
  }
}

/* ── Matching (M1.2) ────────────────────────────────────────────────────── */

/**
 * Policies "own preferences" / "own matches" / "own favorites" — these were
 * strictly private, so the filter is simply the owner.
 */
export const ownerOnlyFilter = (user: SessionUser) => ({ userId: user.id });

/** Policy "join requests visible to applicant and landlord". */
export function joinRequestVisibilityFilter(user: SessionUser): Prisma.JoinRequestWhereInput {
  if (isPlatformAdmin(user)) return {};
  return { OR: [{ userId: user.id }, { listing: { landlordId: user.id } }] };
}

/**
 * Policy "applicant or landlord updates join request", plus the rule the API
 * enforced on top: an applicant may only withdraw, a landlord may only accept
 * or reject.
 */
export async function assertCanSetJoinRequestStatus(
  user: SessionUser,
  requestId: string,
  status: "ACCEPTED" | "REJECTED" | "WITHDRAWN"
) {
  const request = await prisma.joinRequest.findUnique({
    where: { id: requestId },
    select: { userId: true, listing: { select: { landlordId: true, houseId: true } } },
  });
  if (!request) throw new AuthzError("No such join request", 404);

  const isApplicant = request.userId === user.id;
  const isLandlord = request.listing.landlordId === user.id;

  if (isApplicant && status !== "WITHDRAWN") {
    throw new AuthzError("As the applicant you can only withdraw a request.");
  }
  if (!isApplicant && !isLandlord) {
    throw new AuthzError("Only the listing's landlord can accept or reject a request.");
  }
  if (isLandlord && status === "WITHDRAWN") {
    throw new AuthzError("Only the applicant can withdraw their own request.");
  }
  return request;
}

/* ── Mess Court (M3.5) ──────────────────────────────────────────────────── */

/** Policy "disputes visible to house and landlord". */
export function disputeVisibilityFilter(user: SessionUser): Prisma.DisputeWhereInput {
  if (isPlatformAdmin(user)) return {};
  return {
    OR: [
      { house: { members: { some: { userId: user.id, status: "ACTIVE" } } } },
      { house: { landlordId: user.id } },
    ],
  };
}

/* ── Admin (common workflow 2) ──────────────────────────────────────────── */

/** Replaces every policy clause that read `or public.is_platform_admin()`. */
export function assertPlatformAdmin(user: SessionUser) {
  if (!isPlatformAdmin(user)) {
    throw new AuthzError("This area is restricted to platform administrators.");
  }
}

/**
 * Policy "platform admins manage profiles", plus the safety rule the console
 * enforced: an admin may not strip their own admin role, because that could
 * leave the platform with nobody able to reach the admin pages.
 */
export function assertCanChangeRole(user: SessionUser, targetUserId: string, nextRole: string) {
  assertPlatformAdmin(user);
  if (targetUserId === user.id && nextRole !== "ADMIN") {
    throw new AuthzError("You can't remove your own admin role. Ask another admin to do it.");
  }
}

/* ── Profiles ───────────────────────────────────────────────────────────── */

/**
 * Policy "users update own profile". Self-service role switching stays limited
 * to the two non-privileged roles; ADMIN is granted only through the console.
 */
export function sanitizeProfilePatch(patch: { role?: string }) {
  if (patch.role && patch.role !== "RESIDENT" && patch.role !== "LANDLORD") {
    delete patch.role;
  }
  return patch;
}
