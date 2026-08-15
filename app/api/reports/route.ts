import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import type { ReportTargetType } from "@prisma/client";

/** M1.2 — Report & Block Safety System, reporting half (Mahia Tanzin). */

export const dynamic = "force-dynamic";

const TARGET_TYPES: ReportTargetType[] = ["USER", "LISTING", "ROOMMATE_POST"];

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<{ target_type: ReportTargetType; target_id: string; reason: string }>(req);
  if (!body?.target_type || !body?.target_id || !body?.reason?.trim()) {
    return badRequest("target_type, target_id and reason are required");
  }
  if (!TARGET_TYPES.includes(body.target_type)) {
    return badRequest(`target_type must be one of: ${TARGET_TYPES.join(", ")}`);
  }

  const report = await prisma.report.create({
    data: {
      reporterId: user.id,
      targetType: body.target_type,
      targetId: body.target_id,
      reason: body.reason.trim(),
      status: "OPEN",
    },
  });
  return ok(report, 201);
});
