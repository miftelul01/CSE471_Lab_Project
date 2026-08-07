import { badRequest, fromPostgrestError, notImplemented, ok, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** M3.6 Google Calendar API Integration — Md. Mahidul Alam Araf. */

// Uses cookies() for the session, so it can never be statically prerendered.
export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before using the shared calendar.");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("house_id", houseId)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });

  if (error) return fromPostgrestError(error);
  return ok({ events: data });
});

/**
 * TODO (M3.6): sync to Google Calendar.
 *  1. Gather the events to push (rent due, guest windows, dispute deadlines).
 *  2. Upsert calendar_events on (source_type, source_id) — that unique index is
 *     what stops every sync run from duplicating the same event.
 *  3. Read the house's google_calendar_id and the OAuth token from
 *     google_credentials via createAdminClient(); that table is unreadable
 *     with a normal session by design.
 *  4. Insert or patch in Google depending on whether google_event_id is set,
 *     then store the id and stamp synced_at.
 */
export const POST = withUser(async () => notImplemented("Syncing the house calendar"));
