import { fromPostgrestError, notFound, notImplemented, ok, withUser } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

type Params = { params: { id: string } };

/** M1.1 Property & Room Listing Engine — Miftelul Mehebub. */

// Uses cookies() for the session, so it can never be statically prerendered.
export const dynamic = "force-dynamic";

export const GET = withUser(async (_user, _req: Request, { params }: Params) => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return fromPostgrestError(error);
  if (!data) return notFound("No such listing");
  return ok(data);
});

/**
 * TODO (M1.1): whitelist the editable columns (title, description, rent, area,
 * room_type, capacity, amenities, is_active, lat/lng) and update by id. You do
 * NOT need to check ownership by hand — the "landlords update own listings"
 * policy already restricts the row set. An update that matches nothing comes
 * back as an empty array, so use .select() and 404 when it's empty.
 */
export const PATCH = withUser(async () => notImplemented("Editing listings"));

/**
 * TODO (M1.1): prefer a soft delist (update is_active = false) over DELETE —
 * matches, favorites and join_requests all reference this row.
 */
export const DELETE = withUser(async () => notImplemented("Delisting properties"));
