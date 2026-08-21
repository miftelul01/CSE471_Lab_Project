-- Bug fix: these two partial unique indexes were part of the original plan
-- (documented, and both routes already carry catch-P2002 handling for
-- them), but were never actually added to the initial M3.4 migration — that
-- migration was generated from `prisma migrate diff`, which can only emit
-- what schema.prisma's DSL can express, and Prisma's `@@unique` always
-- means a FULL constraint, not a partial one scoped to a single status
-- value. Without this, chore_marketplace_posts and chore_swap_requests had
-- no protection at all against the same assignment being posted/proposed
-- more than once while still open — confirmed live: POSTing the same
-- assignment to the marketplace twice succeeded both times instead of the
-- second call hitting the "already posted" error its own route code was
-- already written to handle.
--
-- Same technique as the existing roommate_match_requests_one_open_per_pair
-- / join_requests_one_open_per_listing indexes: scope the uniqueness to
-- only the "still open" status, so a resolved post/swap never blocks a
-- fresh one on the same assignment later.

CREATE UNIQUE INDEX "chore_marketplace_posts_one_open_per_assignment"
  ON "chore_marketplace_posts" (assignment_id)
  WHERE status = 'OPEN';

CREATE UNIQUE INDEX "chore_swap_requests_one_open_per_proposer_assignment"
  ON "chore_swap_requests" (proposer_assignment_id)
  WHERE status = 'PENDING';
