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

/**
 * A field the caller did not mention keeps its current value; one they sent
 * empty is being deliberately cleared.
 *
 * The difference matters more here than anywhere else in the app. This route
 * used to write `body.phone || null` unconditionally, so any PATCH that didn't
 * happen to include a phone number erased it — along with both emergency
 * contacts, which are exactly the fields nobody notices are gone until the day
 * somebody needs them.
 */
const patchField = (value: string | undefined) =>
  value === undefined ? undefined : value.trim() || null;

export const PATCH = withUser(async (user, req: Request) => {
  const body = await readJson<ProfilePatch>(req);
  if (!body) return badRequest("Invalid JSON body");

  // Whitelist: never spread the request body into an update, or a caller could
  // send { id } or { passwordHash } and rewrite something they shouldn't.
  const patch: ProfilePatch = {
    name: body.name,
    phone: body.phone,
    emergencyContactName: body.emergencyContactName,
    emergencyContactPhone: body.emergencyContactPhone,
    role: body.role,
  };

  // Self-service role switching stays limited to the two non-privileged roles.
  sanitizeProfilePatch(patch);

  if (patch.name !== undefined && !patch.name.trim()) {
    return badRequest("Your name can't be empty.");
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      phone: patchField(patch.phone),
      emergencyContactName: patchField(patch.emergencyContactName),
      emergencyContactPhone: patchField(patch.emergencyContactPhone),
      ...(patch.role ? { role: patch.role } : {}),
    },
    // Redundant with the global omit in lib/prisma.ts, and kept deliberately:
    // this is the route that leaked the hash, so the guard is stated where the
    // mistake was made.
    omit: { passwordHash: true },
  });

  return ok(updated);
});
