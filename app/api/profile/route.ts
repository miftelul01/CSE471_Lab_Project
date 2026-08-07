import { badRequest, fromPostgrestError, ok, readJson, withUser } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

/**
 * Common Workflow 1 — user profile management.
 *
 * Worth reading as the reference shape for every other endpoint in this
 * project: withUser() for the session, an explicit whitelist of writable
 * fields, and fromPostgrestError() so DB failures become sensible HTTP codes.
 */

// Uses cookies() for the session, so it can never be statically prerendered.
export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => ok(user.profile));

type ProfilePatch = Partial<
  Pick<
    Profile,
    "full_name" | "phone" | "role" | "emergency_contact_name" | "emergency_contact_phone"
  >
>;

export const PATCH = withUser(async (user, req: Request) => {
  const body = await readJson<ProfilePatch>(req);
  if (!body) return badRequest("Invalid JSON body");

  // Whitelist: never spread the request body straight into an update, or a
  // user could POST {"id": "<someone else>"} and rewrite another row.
  const patch: ProfilePatch = {
    full_name: body.full_name,
    phone: body.phone || null,
    emergency_contact_name: body.emergency_contact_name || null,
    emergency_contact_phone: body.emergency_contact_phone || null,
  };

  // Self-service role switching is limited to the two non-privileged roles;
  // ADMIN is granted directly in the database.
  if (body.role === "RESIDENT" || body.role === "LANDLORD") {
    patch.role = body.role;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id)
    .select("*")
    .single();

  if (error) return fromPostgrestError(error);
  return ok(data);
});
