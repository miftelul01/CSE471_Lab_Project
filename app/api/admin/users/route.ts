import { badRequest, ok, readJson, withAdmin } from "@/lib/api";
import { assertCanChangeRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

/** Common Workflow 2 — admin oversight of user roles. */

export const dynamic = "force-dynamic";

const ROLES: UserRole[] = ["RESIDENT", "LANDLORD", "ADMIN"];

export const GET = withAdmin(async (_user, req: Request) => {
  const search = new URL(req.url).searchParams.get("q");

  const users = await prisma.user.findMany({
    where: search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return ok({ users });
});

export const PATCH = withAdmin(async (user, req: Request) => {
  const body = await readJson<{ id: string; role: UserRole }>(req);
  if (!body?.id || !body?.role) return badRequest("id and role are required");
  if (!ROLES.includes(body.role)) return badRequest(`role must be one of: ${ROLES.join(", ")}`);

  // Throws if an admin is stripping their own admin role — that would be
  // unrecoverable from inside the app, so it's blocked outright.
  assertCanChangeRole(user, body.id, body.role);

  const updated = await prisma.user.update({
    where: { id: body.id },
    data: { role: body.role },
    select: { id: true, email: true, name: true, role: true },
  });

  return ok(updated);
});
