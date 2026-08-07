import { badRequest, fromPostgrestError, ok, readJson, withUser } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

/** M1.2 — saved listings (Mahia Tanzin). Private to their owner via RLS. */

// Uses cookies() for the session, so it can never be statically prerendered.
export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("favorites")
    .select("*, listings(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return fromPostgrestError(error);
  return ok({ favorites: data });
});

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<{ listing_id: string }>(req);
  if (!body?.listing_id) return badRequest("listing_id is required");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("favorites")
    // Saving twice is a no-op rather than a 400 — matches what the star button
    // in the UI actually means.
    .upsert({ user_id: user.id, listing_id: body.listing_id }, { onConflict: "user_id,listing_id" })
    .select("*")
    .single();

  if (error) return fromPostgrestError(error);
  return ok(data, 201);
});

export const DELETE = withUser(async (user, req: Request) => {
  const listingId = new URL(req.url).searchParams.get("listing_id");
  if (!listingId) return badRequest("listing_id query parameter is required");

  const supabase = createClient();
  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("listing_id", listingId);

  if (error) return fromPostgrestError(error);
  return ok({ removed: true });
});
