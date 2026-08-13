import { notImplemented, withUser } from "@/lib/api";

/**
 * M2.2 Weekly Menu Proposal & Voting System — Mahia Tanzin.
 *
 * TODO:
 *  1. Read { vote: 1 | -1 } from the body and reject anything else — the DB
 *     check constraint allows only those two values.
 *  2. Upsert into menu_votes on (proposal_id, user_id) so a second vote
 *     REPLACES the first rather than 409-ing. The unique index is what stops
 *     one person voting twice.
 *  3. Return the new tally so the UI can update without a refetch.
 *
 * RLS already blocks votes on proposals that aren't OPEN, and on houses you
 * don't belong to — you don't need to re-check either here.
 */
export const POST = withUser(async () => notImplemented("Voting on a menu proposal"));
