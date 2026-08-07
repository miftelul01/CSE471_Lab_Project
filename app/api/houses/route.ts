import { badRequest, forbidden, fromPostgrestError, missingFields, ok, readJson, withUser } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

// Uses cookies() for the session, so it can never be statically prerendered.
export const dynamic = "force-dynamic";

/** Houses the current user actively belongs to. */
export const GET = withUser(async (user) => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("house_members")
    .select("*, houses(*)")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE");

  if (error) return fromPostgrestError(error);
  return ok({ houses: data });
});

type CreateHouseBody = { name: string; address: string; area?: string };

/**
 * Creates a house and makes the creator its landlord + house admin in one go.
 * Two writes rather than one, so if the membership insert fails we roll the
 * house back by hand — Supabase's REST API has no multi-statement transaction.
 */
export const POST = withUser(async (user, req: Request) => {
  if (user.profile.role === "RESIDENT") {
    return forbidden("Switch your role to Landlord on the profile page before creating a house.");
  }

  const body = await readJson<CreateHouseBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["name", "address"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  const supabase = createClient();

  const { data: house, error: houseError } = await supabase
    .from("houses")
    .insert({
      name: body.name,
      address: body.address,
      area: body.area || null,
      landlord_id: user.id,
    })
    .select("*")
    .single();

  if (houseError) return fromPostgrestError(houseError);

  const { error: memberError } = await supabase.from("house_members").insert({
    house_id: house.id,
    user_id: user.id,
    role: user.profile.role,
    is_house_admin: true,
    status: "ACTIVE",
  });

  if (memberError) {
    await supabase.from("houses").delete().eq("id", house.id);
    return fromPostgrestError(memberError);
  }

  return ok(house, 201);
});
