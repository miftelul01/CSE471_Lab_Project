import { badRequest, ok, withUser } from "@/lib/api";
import { requireActiveHouseId } from "@/lib/authz";
import { MIN_AUTOCOMPLETE_CHARS, searchPlaces } from "@/lib/mapProviders";

/**
 * M2.4 — place autocomplete, proxied.
 *
 * The browser never sees a provider key. It calls this route, this route calls
 * Barikoi with a key that only exists in the server environment, and the answer
 * comes back stripped to the four fields the feature stores.
 *
 * The client debounces at 350ms and holds off below three characters; this side
 * enforces the character floor again and caches every answer for 24 hours by
 * the query string. The two halves are not redundant — one saves the round trip,
 * the other saves the quota, and only the server can enforce anything.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, req: Request) => {
  // Not because the suggestions are house-scoped — they are not — but because
  // an authenticated stranger with no house should not be able to spend this
  // project's provider allowance.
  await requireActiveHouseId(user);

  const query = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (query.length < MIN_AUTOCOMPLETE_CHARS) {
    return badRequest(`Type at least ${MIN_AUTOCOMPLETE_CHARS} characters to search for a place.`);
  }

  const { suggestions, cached } = await searchPlaces(user.id, query);
  return ok({ suggestions, cached });
});
