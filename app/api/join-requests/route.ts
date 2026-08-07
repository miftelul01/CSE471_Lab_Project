import { badRequest, forbidden, fromPostgrestError, ok, readJson, withUser } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import type { JoinRequestStatus } from "@/lib/supabase/types";

/**
 * M1.2 — formal join requests (Mahia Tanzin).
 *
 * Two-sided: the applicant sees their own requests, the landlord sees requests
 * against their listings. Both come back from the same SELECT because the RLS
 * policy in migration 0003 already encodes exactly that rule — no extra
 * filtering needed here.
 */

// Uses cookies() for the session, so it can never be statically prerendered.
export const dynamic = "force-dynamic";

export const GET = withUser(async () => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("join_requests")
    .select("*, listings(*)")
    .order("created_at", { ascending: false });

  if (error) return fromPostgrestError(error);
  return ok({ requests: data });
});

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<{ listing_id: string; message?: string }>(req);
  if (!body?.listing_id) return badRequest("listing_id is required");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("join_requests")
    .insert({
      user_id: user.id,
      listing_id: body.listing_id,
      message: body.message || null,
      status: "PENDING",
    })
    .select("*")
    .single();

  if (error) {
    // Blocked by join_requests_one_open_per_listing.
    if (error.code === "23505") {
      return badRequest("You already have a pending request for this listing.");
    }
    return fromPostgrestError(error);
  }
  return ok(data, 201);
});

const APPLICANT_ALLOWED: JoinRequestStatus[] = ["WITHDRAWN"];
const LANDLORD_ALLOWED: JoinRequestStatus[] = ["ACCEPTED", "REJECTED"];

/** Applicant withdraws; landlord accepts or rejects. */
export const PATCH = withUser(async (user, req: Request) => {
  const body = await readJson<{ id: string; status: JoinRequestStatus }>(req);
  if (!body?.id || !body?.status) return badRequest("id and status are required");

  const supabase = createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("join_requests")
    .select("*, listings(landlord_id)")
    .eq("id", body.id)
    .maybeSingle();

  if (fetchError) return fromPostgrestError(fetchError);
  if (!existing) return badRequest("No such join request");

  const isApplicant = existing.user_id === user.id;
  const isLandlord = (existing.listings as { landlord_id: string } | null)?.landlord_id === user.id;

  const allowed = isApplicant ? APPLICANT_ALLOWED : isLandlord ? LANDLORD_ALLOWED : [];
  if (!allowed.includes(body.status)) {
    return forbidden(
      isApplicant
        ? "As the applicant you can only withdraw a request."
        : "Only the listing's landlord can accept or reject a request."
    );
  }

  const { data, error } = await supabase
    .from("join_requests")
    .update({ status: body.status })
    .eq("id", body.id)
    .select("*")
    .single();

  if (error) return fromPostgrestError(error);
  return ok(data);
});
