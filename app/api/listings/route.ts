import { fromPostgrestError, notImplemented, ok, withUser } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

/**
 * M1.1 Property & Room Listing Engine — Miftelul Mehebub.
 *
 * GET is done and doubles as the pattern for the rest: read the filters off
 * the query string, let RLS handle "what am I allowed to see".
 */

// Uses cookies() for the session, so it can never be statically prerendered.
export const dynamic = "force-dynamic";

export const GET = withUser(async (_user, req: Request) => {
  const params = new URL(req.url).searchParams;
  const supabase = createClient();

  let query = supabase.from("listings").select("*").eq("is_active", true);

  const area = params.get("area");
  const minRent = params.get("min_rent");
  const maxRent = params.get("max_rent");
  const roomType = params.get("room_type");

  if (area) query = query.ilike("area", `%${area}%`);
  if (minRent) query = query.gte("rent", Number(minRent));
  if (maxRent) query = query.lte("rent", Number(maxRent));
  if (roomType) query = query.eq("room_type", roomType as never);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return fromPostgrestError(error);
  return ok({ listings: data });
});

/**
 * TODO (M1.1):
 *  1. Reject unless user.profile.role is LANDLORD or ADMIN.
 *  2. readJson<CreateListingBody> and validate: title, rent, area, room_type
 *     are required; rent >= 0; capacity >= 1.
 *  3. Insert with landlord_id: user.id — the RLS insert policy requires it to
 *     match the session user, so don't take it from the body.
 *  4. Return ok(listing, 201).
 */
export const POST = withUser(async () => notImplemented("Creating listings"));
