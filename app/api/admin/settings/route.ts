import { badRequest, ok, readJson, withAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { validateSetting } from "@/lib/settings";

/** Common Workflow 2 — "manage overarching platform settings". */

export const dynamic = "force-dynamic";

export const GET = withAdmin(async () => {
  const settings = await prisma.platformSetting.findMany({ orderBy: { key: "asc" } });
  return ok({ settings });
});

export const PATCH = withAdmin(async (user, req: Request) => {
  const body = await readJson<{ key: string; value: unknown }>(req);
  if (!body?.key) return badRequest("key is required");

  // Validate against the declared kind, so a typo can't put a string into
  // disputeVotingHours and quietly break the escalation job later.
  const invalid = validateSetting(body.key, body.value);
  if (invalid) return badRequest(invalid);

  const setting = await prisma.platformSetting.update({
    where: { key: body.key },
    data: { value: body.value as never, updatedById: user.id },
  });

  return ok(setting);
});
