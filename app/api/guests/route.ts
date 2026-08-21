import { badRequest, notFound, ok, withUser, readJson, missingFields, fromPrismaError } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { assertHouseMember, isHouseAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

/** M1.3 Guest Registration & Accountability Log — Md. Mahidul Alam Araf. */

export const dynamic = "force-dynamic";

/** Postgres `text` accepts any size; the log stays readable only if we don't. */
const MAX_GUEST_NAME = 120;
const MAX_GUEST_PHONE = 32;
const MAX_PURPOSE = 500;

export const GET = withUser(async (user) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before using the guest log.");

  const guests = await prisma.guestLog.findMany({
    where: { houseId },
    include: { host: { select: { name: true } } },
    orderBy: { checkedInAt: "desc" },
  });
  return ok({ guests });
});

/**
 * M1.3 Guest check-in.
 *  1. Validate guestName is present.
 *  2. Assert the user is an active house member.
 *  3. Create the guest log entry with status CHECKED_IN.
 *  4. Set notifiedAdminAt = now() so the notification flag is recorded.
 */
export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<{
    guestName: string;
    guestPhone?: string | null;
    purpose?: string | null;
    expectedCheckOut?: string | null;
  }>(req);
  if (!body) return badRequest("Invalid JSON body.");

  const missing = missingFields(body, ["guestName"]);
  if (missing.length > 0) return badRequest(`Missing fields: ${missing.join(", ")}`);

  const guestName = String(body.guestName).trim();
  if (!guestName) return badRequest("Give the guest a name.");
  if (guestName.length > MAX_GUEST_NAME) {
    return badRequest(`Guest name must be ${MAX_GUEST_NAME} characters or fewer.`);
  }

  const guestPhone = body.guestPhone?.toString().trim() || null;
  if (guestPhone && guestPhone.length > MAX_GUEST_PHONE) {
    return badRequest(`Phone must be ${MAX_GUEST_PHONE} characters or fewer.`);
  }

  const purpose = body.purpose?.toString().trim() || null;
  if (purpose && purpose.length > MAX_PURPOSE) {
    return badRequest(`Purpose must be ${MAX_PURPOSE} characters or fewer.`);
  }

  let expectedCheckOut: Date | null = null;
  if (body.expectedCheckOut) {
    expectedCheckOut = new Date(body.expectedCheckOut);
    if (Number.isNaN(expectedCheckOut.getTime())) {
      return badRequest("expectedCheckOut is not a valid date.");
    }
    // A checkout already in the past means the form was misread; the entry
    // would show up permanently overdue on the log.
    if (expectedCheckOut.getTime() < Date.now()) {
      return badRequest("Expected check-out can't be in the past.");
    }
  }

  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before logging guests.");

  await assertHouseMember(user, houseId);

  try {
    const guestLog = await prisma.guestLog.create({
      data: {
        houseId,
        hostUserId: user.id,
        guestName,
        guestPhone,
        purpose,
        expectedCheckOut,
        status: "CHECKED_IN",
        notifiedAdminAt: new Date(),
      },
    });
    return ok({ guestLog }, 201);
  } catch (err) {
    const prismaResponse = fromPrismaError(err);
    if (prismaResponse) return prismaResponse;
    throw err;
  }
});

/**
 * M1.3 Guest check-out — set status CHECKED_OUT and stamp checkedOutAt.
 * Also supports CANCELLED for mistaken entries.
 */
export const PATCH = withUser(async (user, req: Request) => {
  const body = await readJson<{ guestId: string; status: "CHECKED_OUT" | "CANCELLED" }>(req);
  if (!body) return badRequest("Invalid JSON body.");

  const { guestId, status } = body;
  if (!guestId) return badRequest("Missing guestId.");
  if (status !== "CHECKED_OUT" && status !== "CANCELLED") {
    return badRequest("Status must be CHECKED_OUT or CANCELLED.");
  }

  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before using the guest log.");

  await assertHouseMember(user, houseId);

  // Verify the guest belongs to this house
  const existing = await prisma.guestLog.findUnique({
    where: { id: guestId },
    select: { houseId: true, status: true, hostUserId: true },
  });
  if (!existing) return notFound("No such guest log entry.");
  if (existing.houseId !== houseId) {
    return badRequest("That guest log doesn't belong to your house.");
  }
  if (existing.status !== "CHECKED_IN") {
    return badRequest(`Guest is already ${existing.status}.`);
  }

  /**
   * Checking a guest out is open to the whole house — whoever is in when the
   * visitor leaves should be able to log it, and it leaves the visit on the
   * record either way.
   *
   * Cancelling is not. CANCELLED is the state that says the visit never
   * happened, and M1.3 exists to be a permanent accountability log. Letting
   * any resident erase somebody else's guest — with no event trail on the row
   * to show who did it — would make the log worth exactly as much as the least
   * trustworthy person with an account.
   */
  if (status === "CANCELLED") {
    const permitted =
      existing.hostUserId === user.id ||
      user.profile.role === "ADMIN" ||
      (await isHouseAdmin(user.id, houseId));
    if (!permitted) {
      return badRequest(
        "Only whoever logged this guest, or your house admin, can cancel the entry. You can check them out instead."
      );
    }
  }

  try {
    const updated = await prisma.guestLog.update({
      where: { id: guestId },
      data: {
        status,
        checkedOutAt: status === "CHECKED_OUT" ? new Date() : undefined,
      },
    });
    return ok({ guestLog: updated });
  } catch (err) {
    const prismaResponse = fromPrismaError(err);
    if (prismaResponse) return prismaResponse;
    throw err;
  }
});
