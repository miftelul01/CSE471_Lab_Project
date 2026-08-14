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

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<{ phone?: string; note?: string }>(req);
  if (!body?.phone?.trim()) return badRequest("phone is required");

  const pending = await prisma.verificationRequest.findFirst({
    where: { userId: user.id, status: "PENDING" },
  });
  if (pending) return badRequest("You already have a verification request pending review.");

  const request = await prisma.verificationRequest.create({
    data: { userId: user.id, phone: body.phone.trim(), note: body.note?.trim() || null, status: "PENDING" },
  });
  return ok(request, 201);
});
