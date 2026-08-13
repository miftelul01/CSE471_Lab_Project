import { badRequest, ok, readJson, withUser } from "@/lib/api";
import { sanitizeProfilePatch } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

/**
 * Common Workflow 1 — user profile management.
 *
 * The reference shape for every endpoint here: withUser() for the session, an
 * explicit whitelist of writable fields, and Prisma errors mapped to sensible
 * HTTP codes by withUser's catch.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => ok(user.profile));

type ProfilePatch = {
  name?: string;
  phone?: string;
  role?: UserRole;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
};

export const PATCH = withUser(async (user, req: Request) => {
  const body = await readJson<ProfilePatch>(req);
  if (!body) return badRequest("Invalid JSON body");

  // Whitelist: never spread the request body into an update, or a caller could
  // send { id } or { passwordHash } and rewrite something they shouldn't.
  const patch: ProfilePatch = {
    name: body.name,
    phone: body.phone || undefined,
    emergencyContactName: body.emergencyContactName || undefined,
    emergencyContactPhone: body.emergencyContactPhone || undefined,
    role: body.role,
  };

  // Self-service role switching stays limited to the two non-privileged roles.
  sanitizeProfilePatch(patch);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      phone: body.phone || null,
      emergencyContactName: body.emergencyContactName || null,
      emergencyContactPhone: body.emergencyContactPhone || null,
      ...(patch.role ? { role: patch.role } : {}),
    },
  });

  return ok(updated);
});
