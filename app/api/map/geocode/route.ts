import { badRequest, ok, withUser } from "@/lib/api";
import { searchPlaces } from "@/lib/mapProviders";

/**
 * M3.3 — Address search/geocoding for the "Find on map" listing-form button
 * and the commute-origin input. Thin proxy over M2.4's searchPlaces() (same
 * Photon/Barikoi provider, same 24h cache) — metered under its own "geocode"
 * bucket (lib/mapProviders.ts) so this module's traffic never eats M2.4's
 * autocomplete quota, or vice versa.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: Request) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (!q.trim()) return badRequest("q is required");

  const { suggestions, cached } = await searchPlaces(user.id, q, "geocode");
  return ok({ suggestions, cached });
});
