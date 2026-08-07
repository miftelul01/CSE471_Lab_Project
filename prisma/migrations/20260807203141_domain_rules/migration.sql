-- ============================================================================
-- Domain rules that Prisma's schema language cannot express.
--
-- These are deliberately in the database rather than in TypeScript, because
-- they must hold no matter which code path runs — a seed script, a webhook, a
-- teammate's route handler, or someone poking at the data in Prisma Studio.
--
-- NOTE ON AUDIT LOGS: under Supabase these tables were also written by
-- triggers, using auth.uid() to record who acted. Prisma connects as a single
-- database user, so the database can no longer tell who is doing anything.
-- Enforcement therefore stays here (it needs no actor), while writing the
-- audit rows moved into application code, inside the same transaction as the
-- change, where the acting user IS known.
-- ============================================================================

-- ── Check constraints ───────────────────────────────────────────────────────

ALTER TABLE "preferences"
  ADD CONSTRAINT preferences_budget_range CHECK (budget_min <= budget_max);

ALTER TABLE "listings"
  ADD CONSTRAINT listings_rent_non_negative CHECK (rent >= 0),
  ADD CONSTRAINT listings_capacity_positive CHECK (capacity > 0);

ALTER TABLE "matches"
  ADD CONSTRAINT matches_score_range CHECK (compatibility_score BETWEEN 0 AND 1);

ALTER TABLE "expenses"
  ADD CONSTRAINT expenses_amount_positive CHECK (amount > 0);

ALTER TABLE "expense_shares"
  ADD CONSTRAINT expense_shares_amount_non_negative CHECK (amount >= 0);

ALTER TABLE "payments"
  ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);

ALTER TABLE "guest_logs"
  ADD CONSTRAINT guest_logs_checkout_after_checkin
    CHECK (checked_out_at IS NULL OR checked_out_at >= checked_in_at);

ALTER TABLE "menu_votes"
  ADD CONSTRAINT menu_votes_value CHECK (vote IN (-1, 1));

ALTER TABLE "menu_proposal_items"
  ADD CONSTRAINT menu_proposal_items_day_range CHECK (day_of_week BETWEEN 0 AND 6);

-- ── Partial unique indexes (a plain @@unique would be too strict) ───────────

-- A user may re-apply after being rejected, but only one live request at a time.
CREATE UNIQUE INDEX join_requests_one_open_per_listing
  ON "join_requests" (user_id, listing_id)
  WHERE status = 'PENDING';

-- Only one winning menu per house per week.
CREATE UNIQUE INDEX menu_proposals_one_approved_per_week
  ON "menu_proposals" (house_id, week_start_date)
  WHERE status = 'APPROVED';

-- ── M2.1 Shared wallet: keep settled_at honest ─────────────────────────────

CREATE OR REPLACE FUNCTION sync_share_settled_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'PAID' AND OLD.status IS DISTINCT FROM 'PAID' THEN
    NEW.settled_at = COALESCE(NEW.settled_at, now());
  ELSIF NEW.status <> 'PAID' THEN
    NEW.settled_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER expense_shares_sync_settled_at
  BEFORE UPDATE ON "expense_shares"
  FOR EACH ROW EXECUTE FUNCTION sync_share_settled_at();

-- ── M2.3 Meal attendance: the cook's quantity can never drift ──────────────
-- Recalculating in the database means headcount cannot disagree with the
-- actual toggles, which is the whole point of the feature.

CREATE OR REPLACE FUNCTION recalc_meal_headcount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_meal_id text := COALESCE(NEW.meal_id, OLD.meal_id);
BEGIN
  UPDATE "meals"
  SET headcount = (
    SELECT count(*) FROM "meal_attendance"
    WHERE meal_id = v_meal_id AND status = 'ATTENDING'
  )
  WHERE id = v_meal_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER meal_attendance_recalc_headcount
  AFTER INSERT OR UPDATE OR DELETE ON "meal_attendance"
  FOR EACH ROW EXECUTE FUNCTION recalc_meal_headcount();

-- ── M3.1 Maintenance: stamp resolved_at ────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_ticket_resolved_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'RESOLVED' AND OLD.status IS DISTINCT FROM 'RESOLVED' THEN
    NEW.resolved_at = COALESCE(NEW.resolved_at, now());
  ELSIF NEW.status IN ('OPEN', 'IN_PROGRESS') THEN
    NEW.resolved_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER maintenance_tickets_sync_resolved_at
  BEFORE UPDATE ON "maintenance_tickets"
  FOR EACH ROW EXECUTE FUNCTION sync_ticket_resolved_at();

-- ── M3.2 Payments: "upon successful payment the ledger updates to paid" ────
-- Straight from the requirements. In the database so it holds whether the
-- payment is confirmed by a bKash webhook, a Stripe webhook, or a manual fix.

CREATE OR REPLACE FUNCTION apply_successful_payment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'SUCCEEDED'
     AND OLD.status IS DISTINCT FROM 'SUCCEEDED'
     AND NEW.expense_share_id IS NOT NULL THEN
    UPDATE "expense_shares"
    SET status = 'PAID', settled_at = now()
    WHERE id = NEW.expense_share_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER payments_apply_to_ledger
  AFTER UPDATE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION apply_successful_payment();

-- ── M3.5 Mess Court: the state machine ─────────────────────────────────────
--
--   RAISED ──> VOTING ──> RESOLVED ──> ARCHIVED
--     │          │                        ^
--     │          └──> ESCALATED ──────────┘
--     │                   │
--     │                   └──> RESOLVED
--     └──────────────────────> ARCHIVED
--
-- ARCHIVED is terminal. The requirement calls for a strict state machine
-- rather than a CRUD table, so illegal transitions raise an exception that no
-- application code can bypass.

CREATE OR REPLACE FUNCTION dispute_transition_allowed(
  p_from "DisputeState",
  p_to   "DisputeState"
) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_from
    WHEN 'RAISED'    THEN p_to IN ('VOTING', 'ARCHIVED')
    WHEN 'VOTING'    THEN p_to IN ('RESOLVED', 'ESCALATED', 'ARCHIVED')
    WHEN 'RESOLVED'  THEN p_to IN ('ARCHIVED')
    WHEN 'ESCALATED' THEN p_to IN ('RESOLVED', 'ARCHIVED')
    WHEN 'ARCHIVED'  THEN false
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION enforce_dispute_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF NOT dispute_transition_allowed(OLD.state, NEW.state) THEN
      RAISE EXCEPTION 'Illegal Mess Court transition: % -> %', OLD.state, NEW.state
        USING ERRCODE = '23514';
    END IF;

    -- Timestamps that belong to the transition, not to the caller.
    IF NEW.state = 'VOTING' THEN
      NEW.voting_started_at := COALESCE(NEW.voting_started_at, now());
      NEW.voting_deadline   := COALESCE(NEW.voting_deadline, now() + interval '48 hours');
    ELSIF NEW.state = 'RESOLVED' THEN
      NEW.resolved_at := COALESCE(NEW.resolved_at, now());
    ELSIF NEW.state = 'ESCALATED' THEN
      NEW.escalated_at := COALESCE(NEW.escalated_at, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER disputes_enforce_transition
  BEFORE UPDATE ON "disputes"
  FOR EACH ROW EXECUTE FUNCTION enforce_dispute_transition();
