import { badRequest, fromPostgrestError, ok, readJson, withUser } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

type JoinBody = { house_id: string };

/**
 * Join a house by id.
 *
 * Joins are auto-approved for now (status ACTIVE) to keep the demo flow short.
 * If you want landlord approval, insert with status 'PENDING' here and let the
 * house admin flip it to 'ACTIVE' — the RLS policy already permits that.
 */
export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<JoinBody>(req);
  if (!body?.house_id) return badRequest("house_id is required");

  const supabase = createClient();

  const { data, error } = await supabase
    .from("house_members")
    .upsert(
      {
        house_id: body.house_id,
        user_id: user.id,
        role: user.profile.role,
        status: "ACTIVE",
      },
      { onConflict: "house_id,user_id" }
    )
    .select("*")
    .single();

  // A bad uuid fails the foreign key rather than returning "not found", so
  // translate that into something a user can act on.
  if (error) {
    if (error.code === "23503") return badRequest("No house exists with that id.");
    return fromPostgrestError(error);
  }

  return ok(data, 201);
});
