import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import type { ReportTargetType } from "@prisma/client";

/** M1.2 — Report & Block Safety System, reporting half (Mahia Tanzin). */

export const dynamic = "force-dynamic";

const TARGET_TYPES: ReportTargetType[] = ["USER", "LISTING", "ROOMMATE_POST"];

const MAX_REASON = 1000;

/**
 * Confirms the reported thing exists AND is of the type claimed.
 *
 * `targetId` is a bare string with no foreign key behind it — it has to be,
 * since it points into three different tables. That means nothing stopped a
 * listing id being filed as `target_type: "USER"`, which lands in the
 * moderation queue as a row that renders blank and cannot be actioned.
 */
async function targetExists(type: ReportTargetType, id: string): Promise<boolean> {
  const select = { id: true };
  if (type === "USER") {
    return (await prisma.user.findUnique({ where: { id }, select })) !== null;
  }
  if (type === "LISTING") {
    return (await prisma.listing.findUnique({ where: { id }, select })) !== null;
  }
  return (await prisma.roommatePost.findUnique({ where: { id }, select })) !== null;
}

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<{ target_type: ReportTargetType; target_id: string; reason: string }>(req);
  if (!body?.target_type || !body?.target_id || !body?.reason?.trim()) {
    return badRequest("target_type, target_id and reason are required");
  }
  if (!TARGET_TYPES.includes(body.target_type)) {
    return badRequest(`target_type must be one of: ${TARGET_TYPES.join(", ")}`);
  }

  const reason = body.reason.trim();
  if (reason.length > MAX_REASON) {
    return badRequest(`Reason must be ${MAX_REASON} characters or fewer.`);
  }

  if (body.target_type === "USER" && body.target_id === user.id) {
    return badRequest("You can't report yourself.");
  }

  if (!(await targetExists(body.target_type, body.target_id))) {
    return badRequest("There's nothing here to report — that item doesn't exist.");
  }

  // One open report per person per target. Without this a single user can file
  // the same complaint repeatedly and bury the moderation queue; re-reporting
  // also tells a moderator nothing they don't already have.
  const existing = await prisma.report.findFirst({
    where: {
      reporterId: user.id,
      targetType: body.target_type,
      targetId: body.target_id,
      status: "OPEN",
    },
    select: { id: true },
  });
  if (existing) {
    return badRequest("You've already reported this, and it's still being reviewed.");
  }

  const report = await prisma.report.create({
    data: {
      reporterId: user.id,
      targetType: body.target_type,
      targetId: body.target_id,
      reason,
      status: "OPEN",
    },
  });
  return ok(report, 201);
});
