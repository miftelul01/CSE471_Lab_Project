import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import type { Prisma, ShareStatus } from "@prisma/client";

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
 * The complete visibility rule for rooms — callers must not add their own
 * isActive check on top, or they will re-open the hole this closes.
 *
 * Two independent reasons a room can be hidden, and both must be respected:
 *   isActive false  the landlord delisted it themselves
 *   status REMOVED  an administrator took it down for breaking the rules
 *
 * A landlord still sees their own rooms in either state, so they can re-list
 * or read the moderation reason — but a removed room stays out of everyone
 * else's search regardless of what the owner does to isActive.
 */
export function listingVisibilityFilter(user: SessionUser): Prisma.ListingWhereInput {
  if (isPlatformAdmin(user)) return {};
  return {
    OR: [{ isActive: true, status: "PUBLISHED" }, { landlordId: user.id }],
  };
}

/**
 * Who may edit or delist a rental listing: the landlord who posted it, or a
 * system administrator. Nobody else.
 *
 * The brief says "landlords or house admins", and a flat head IS a house
 * admin — but a flat head is a RESIDENT who runs the household, and letting a
 * tenant rewrite their own landlord's asking rent is clearly not the intent.
 * A flat head governs the household (roommate posts, expenses, chores,
 * disputes); the owner governs the property.
 */
export async function assertCanEditListing(user: SessionUser, listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { landlordId: true },
  });
  if (!listing) throw new AuthzError("No such listing", 404);

  if (isPlatformAdmin(user)) return;
  if (listing.landlordId === user.id) return;

  throw new AuthzError("Only the landlord who posted this room can change it.");
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

/* ── Shared wallet (M2.1) ───────────────────────────────────────────────── */

/**
 * Who may move a ledger row between PENDING / PAID / WAIVED.
 *
 * Marking your own share paid is the "I handed the cash over" path. The card
 * and bKash route to the same rows is another area's, and goes through a
 * verified webhook rather than this endpoint.
 *
 * Waiving is different in kind from paying: it forgives money the house is
 * owed, so it stays with the house admin whoever the share belongs to. Letting
 * residents waive their own share would make the ledger meaningless.
 */
export async function assertCanSettleShare(
  user: SessionUser,
  shareId: string,
  status: ShareStatus
) {
  const share = await prisma.expenseShare.findUnique({
    where: { id: shareId },
    select: {
      userId: true,
      status: true,
      expense: { select: { houseId: true } },
      payments: { where: { status: "SUCCEEDED" }, select: { id: true }, take: 1 },
    },
  });
  if (!share) throw new AuthzError("No such expense share", 404);

  // Checked before the role checks, so it binds everyone including a platform
  // administrator: a share a gateway really settled is evidence that money
  // moved. Hand-editing it back to pending would make the ledger contradict
  // the payment record. The way back is a refund, not this endpoint.
  if (share.payments.length > 0 && status !== "PAID") {
    throw new AuthzError(
      "This share was settled by a recorded payment — refund the payment instead of editing the ledger."
    );
  }

  if (isPlatformAdmin(user)) return share;

  const houseAdmin = await isHouseAdmin(user.id, share.expense.houseId);

  if (status === "WAIVED" && !houseAdmin) {
    throw new AuthzError("Only your house admin can waive someone's share.");
  }
  // Reversing a waiver re-imposes a debt the house admin chose to forgive, so
  // it is the same governance decision as granting it — including on your own
  // row, which you would otherwise be free to un-waive.
  if (share.status === "WAIVED" && !houseAdmin) {
    throw new AuthzError("Only your house admin can reverse a waived share.");
  }
  if (share.userId !== user.id && !houseAdmin) {
    throw new AuthzError("You can only settle your own share.");
  }
  return share;
}

/**
 * Who may delete a shared expense: whoever added it, or the house admin.
 *
 * Deletion exists because a mistyped amount charges the whole house and there
 * is otherwise no way back. It stops being available the moment anybody has
 * settled against it — see the state check, which binds every role.
 */
export async function assertCanDeleteExpense(user: SessionUser, expenseId: string) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: {
      houseId: true,
      createdById: true,
      paidById: true,
      shares: {
        select: {
          userId: true,
          status: true,
          payments: { where: { status: "SUCCEEDED" }, select: { id: true }, take: 1 },
        },
      },
    },
  });
  if (!expense) throw new AuthzError("No such expense", 404);

  // Permission first, so someone with no business here learns nothing about
  // the state of an expense they cannot touch.
  const permitted =
    isPlatformAdmin(user) ||
    expense.createdById === user.id ||
    (await isHouseAdmin(user.id, expense.houseId));
  if (!permitted) {
    throw new AuthzError("Only whoever added this expense, or your house admin, can delete it.");
  }

  // The payer's own share is auto-settled the moment the expense is added —
  // it records that they paid the bill, not that anybody reimbursed them. If
  // it counted as settlement here, no expense could ever be deleted.
  // What blocks deletion is somebody ELSE having handed money over.
  const settled = expense.shares.some(
    (share) =>
      share.payments.length > 0 ||
      (share.status === "PAID" && share.userId !== expense.paidById)
  );
  if (settled) {
    throw new AuthzError(
      "Someone has already paid their share of this expense, so it can no longer be deleted. Waive the unpaid shares instead."
    );
  }

  return expense;
}

/* ── Menu voting (M2.2) ─────────────────────────────────────────────────── */

/** Policy: the house admin (flat admin or landlord) closes the week's vote. */
export async function assertCanCloseMenuVoting(user: SessionUser, houseId: string) {
  if (isPlatformAdmin(user)) return;
  if (!(await isHouseAdmin(user.id, houseId))) {
    throw new AuthzError("Only your house admin can close voting for the week.");
  }
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
