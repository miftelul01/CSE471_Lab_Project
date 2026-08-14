-- Bug fix: roommate_match_requests_sender_id_receiver_id_key was a permanent
-- unique constraint on (sender_id, receiver_id), so once a request between
-- two users resolved to CANCELLED/REJECTED/EXPIRED, neither direction could
-- ever create a new one — the 14-day expiry sweep (lib/joinRequests.ts) would
-- flip a stale request to EXPIRED, but the sender could never actually retry.
--
-- Replaced with a partial unique index scoped to PENDING only, matching the
-- existing join_requests_one_open_per_listing pattern: only one *open*
-- request per direction is enforced, and a resolved request no longer blocks
-- a fresh one.
DROP INDEX "roommate_match_requests_sender_id_receiver_id_key";

CREATE UNIQUE INDEX "roommate_match_requests_one_open_per_pair"
  ON "roommate_match_requests" (sender_id, receiver_id)
  WHERE status = 'PENDING';
