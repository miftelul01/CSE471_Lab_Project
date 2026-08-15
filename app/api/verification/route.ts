import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/**
 * M1.2 — Verified Profile Badge (Mahia Tanzin).
 *
 * Admin-reviewed self-attestation (phone / university ID), not a live
 * SMS/ID-provider integration — see VerificationRequest in schema.prisma.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const requests = await prisma.verificationRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return ok({ requests, verified: requests.some((r) => r.status === "VERIFIED") });
});

const MAX_NOTE = 500;

/**
 * Bangladeshi mobile numbers: 11 digits starting 01, optionally with the +880
 * country code. Loose enough for how people actually type them (spaces and
 * dashes are stripped first), strict enough that an admin is reviewing
 * something that could be a real number — which is the entire point of the
 * badge. It was previously accepted as any non-empty string.
 */
const BD_MOBILE = /^(?:\+?880)?1[3-9]\d{8}$/;

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<{ phone?: string; note?: string }>(req);
  if (!body?.phone?.trim()) return badRequest("phone is required");

  const phone = body.phone.replace(/[\s-]/g, "");
  if (!BD_MOBILE.test(phone)) {
    return badRequest("That doesn't look like a Bangladeshi mobile number (e.g. 01712345678).");
  }

  const note = body.note?.trim() || null;
  if (note && note.length > MAX_NOTE) {
    return badRequest(`Note must be ${MAX_NOTE} characters or fewer.`);
  }

  // Both states block a new request, for different reasons: a PENDING one is
  // already in the queue, and a VERIFIED user has nothing left to ask for.
  // Only PENDING was checked before, so a verified user could keep filing.
  const existing = await prisma.verificationRequest.findFirst({
    where: { userId: user.id, status: { in: ["PENDING", "VERIFIED"] } },
    select: { status: true },
  });
  if (existing?.status === "PENDING") {
    return badRequest("You already have a verification request pending review.");
  }
  if (existing?.status === "VERIFIED") {
    return badRequest("Your profile is already verified.");
  }

  const request = await prisma.verificationRequest.create({
    data: { userId: user.id, phone, note, status: "PENDING" },
  });
  return ok(request, 201);
});
