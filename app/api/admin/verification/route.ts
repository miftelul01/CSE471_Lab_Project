import { badRequest, notFound, ok, readJson, withAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import type { VerificationStatus } from "@prisma/client";

/** M1.2 — Verified Profile Badge, admin review (Mahia Tanzin). */

export const dynamic = "force-dynamic";

export const GET = withAdmin(async (_user, req: Request) => {
  const status = new URL(req.url).searchParams.get("status") ?? "PENDING";
  const requests = await prisma.verificationRequest.findMany({
    where: status === "ALL" ? undefined : { status: status as VerificationStatus },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return ok({ requests });
});

export const PATCH = withAdmin(async (user, req: Request) => {
  const body = await readJson<{ id: string; status: "VERIFIED" | "REJECTED" }>(req);
  if (!body?.id || !body?.status) return badRequest("id and status are required");
  if (body.status !== "VERIFIED" && body.status !== "REJECTED") {
    return badRequest("status must be VERIFIED or REJECTED");
  }

  const existing = await prisma.verificationRequest.findUnique({ where: { id: body.id } });
  if (!existing) return notFound("No such verification request");

  const updated = await prisma.verificationRequest.update({
    where: { id: body.id },
    data: { status: body.status, reviewedById: user.id, reviewedAt: new Date() },
  });
  return ok(updated);
});
