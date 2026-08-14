import { badRequest, notFound, ok, readJson, withAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import type { ReportStatus } from "@prisma/client";

/** M1.2 — Report & Block Safety System, admin review (Mahia Tanzin). */

export const dynamic = "force-dynamic";

export const GET = withAdmin(async (_user, req: Request) => {
  const status = new URL(req.url).searchParams.get("status") ?? "OPEN";
  const reports = await prisma.report.findMany({
    where: status === "ALL" ? undefined : { status: status as ReportStatus },
    include: { reporter: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  return ok({ reports });
});

export const PATCH = withAdmin(async (_user, req: Request) => {
  const body = await readJson<{ id: string; status: "DISMISSED" | "ACTIONED" }>(req);
  if (!body?.id || !body?.status) return badRequest("id and status are required");
  if (body.status !== "DISMISSED" && body.status !== "ACTIONED") {
    return badRequest("status must be DISMISSED or ACTIONED");
  }

  const existing = await prisma.report.findUnique({ where: { id: body.id } });
  if (!existing) return notFound("No such report");

  const updated = await prisma.report.update({ where: { id: body.id }, data: { status: body.status } });
  return ok(updated);
});
