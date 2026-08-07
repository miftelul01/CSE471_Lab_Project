import { badRequest, fromPostgrestError, notImplemented, ok, withUser } from "@/lib/api";
import { getActiveHouseId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** M3.1 Maintenance Ticket System — Miftelul Mehebub. */

// Uses cookies() for the session, so it can never be statically prerendered.
export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: Request) => {
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) return badRequest("Join a house before reporting maintenance issues.");

  const status = new URL(req.url).searchParams.get("status");
  const supabase = createClient();

  let query = supabase
    .from("maintenance_tickets")
    .select("*, maintenance_ticket_events(*)")
    .eq("house_id", houseId);

  if (status) query = query.eq("status", status as never);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return fromPostgrestError(error);
  return ok({ tickets: data });
});

/**
 * TODO (M3.1): insert a ticket with reported_by: user.id and house_id from
 * getActiveHouseId (RLS requires both). Status defaults to OPEN and the
 * "Ticket created" history row is written by a trigger.
 */
export const POST = withUser(async () => notImplemented("Reporting a maintenance ticket"));

/**
 * TODO (M3.1): update status / assigned_to. Nothing to log by hand — the
 * maintenance_tickets_log_status trigger appends the history row for you.
 */
export const PATCH = withUser(async () => notImplemented("Updating a ticket"));
