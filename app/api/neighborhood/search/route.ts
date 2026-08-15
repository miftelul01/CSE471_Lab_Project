import { Prisma } from "@prisma/client";

import { ok, withUser } from "@/lib/api";
import { requireActiveHouseId } from "@/lib/authz";
import { categoryForNeed } from "@/lib/neighborhood";
import { listBookmarks } from "@/lib/neighborhood.server";
import { prisma } from "@/lib/prisma";

/**
 * M2.4 — search across the house's map.
 *
 * ── WHY TRIGRAMS AND NOT FULL-TEXT SEARCH ───────────────────────────────────
 * Residents write in Bangla, English and Banglish, frequently in one sentence:
 * "Karwan Bazar er fish er dokan, sokal e fresh". to_tsvector('english') would
 * stem that as though it were English, has no stopword list for Bangla, and
 * would still fail the most common case of all — "bazar", "bazaar" and "bazzar"
 * are the same word to a person and three different lexemes to a dictionary.
 *
 * pg_trgm compares three-character sequences and has no language model at all.
 * That indifference is the feature: it treats all three languages the same and
 * tolerates transliteration spelling. There is no text search configuration
 * involved here to get wrong, because no tsvector is ever built.
 *
 * ILIKE runs alongside similarity() because trigram similarity is a ratio over
 * the WHOLE string: searching "gas" against "Rahim Enterprise Gas Cylinder
 * Supply" scores far below the default 0.3 threshold, even though it is
 * obviously a hit.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const dynamic = "force-dynamic";

/** Bookmarks one search returns. Beyond this the answer isn't a search result. */
const SEARCH_LIMIT = 50;

export const GET = withUser(async (user, req: Request) => {
  const houseId = await requireActiveHouseId(user);
  const query = (new URL(req.url).searchParams.get("q") ?? "").trim();

  if (query.length === 0) {
    return ok({ query, matchedCategory: null, results: [], online: [] });
  }

  // Every clause is a bound parameter. String-building a house id or a user's
  // search text into SQL is how a search box becomes an injection point.
  const rows = await prisma.$queryRaw<{ id: string; score: number }[]>(Prisma.sql`
    SELECT b."id",
           GREATEST(
             similarity(b."name", ${query}),
             COALESCE(MAX(similarity(n."body", ${query})), 0)
           ) AS score
    FROM "bookmarks" b
    LEFT JOIN "bookmark_notes" n
      ON n."bookmark_id" = b."id" AND n."deleted_at" IS NULL
    WHERE b."house_id" = ${houseId}
      AND b."deleted_at" IS NULL
      AND (b."visibility" = 'HOUSE' OR b."added_by" = ${user.id})
      AND (
        b."name" % ${query}
        OR n."body" % ${query}
        OR b."name" ILIKE ${`%${query}%`}
        OR n."body" ILIKE ${`%${query}%`}
      )
    GROUP BY b."id"
    ORDER BY score DESC, b."name" ASC
    LIMIT ${SEARCH_LIMIT}
  `);

  const rank = new Map(rows.map((row, index) => [row.id, index]));

  // Hydrated through the same reader every other view uses, so a search result
  // card carries the identical freshness label, deal count and distance the
  // need finder would show for it.
  const list = await listBookmarks(user, houseId);
  const matched = [...list.placed, ...list.online].filter((view) => rank.has(view.id));

  return ok({
    query,
    // A search that is really a category browse still offers the category, so
    // the UI can suggest "see all 6 pharmacies" next to the text matches.
    matchedCategory: categoryForNeed(query),
    results: matched
      .filter((view) => !view.isOnline)
      .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)),
    online: matched
      .filter((view) => view.isOnline)
      .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)),
    pin: list.pin,
  });
});
