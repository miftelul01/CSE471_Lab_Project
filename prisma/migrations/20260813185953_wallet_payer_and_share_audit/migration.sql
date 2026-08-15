-- M2.1 Shared wallet: record who actually paid, and keep a trail of every
-- ledger movement.

-- ── expenses.paid_by ───────────────────────────────────────────────────────
-- Added in three steps rather than as NOT NULL in one: the column is new, so
-- every existing row would violate the constraint at the moment it is added.
-- Backfilling from created_by preserves today's meaning exactly — until now,
-- whoever logged an expense was assumed to have paid for it.
ALTER TABLE "expenses" ADD COLUMN "paid_by" TEXT;
UPDATE "expenses" SET "paid_by" = "created_by" WHERE "paid_by" IS NULL;
ALTER TABLE "expenses" ALTER COLUMN "paid_by" SET NOT NULL;

-- ── expense_share_events ───────────────────────────────────────────────────
CREATE TABLE "expense_share_events" (
    "id" TEXT NOT NULL,
    "share_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "from_status" "ShareStatus",
    "to_status" "ShareStatus" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_share_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expense_share_events_share_id_created_at_idx" ON "expense_share_events"("share_id", "created_at");

CREATE INDEX "expenses_paid_by_idx" ON "expenses"("paid_by");

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expense_share_events" ADD CONSTRAINT "expense_share_events_share_id_fkey" FOREIGN KEY ("share_id") REFERENCES "expense_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expense_share_events" ADD CONSTRAINT "expense_share_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── M3.2 payments: settlements by gateway must leave a trail too ───────────
-- Replaces the function from 20260807203141_domain_rules. Same behaviour as
-- before plus the audit row, so the history does not silently skip the one
-- settlement path a resident never touches by hand. Written in the trigger for
-- the same reason the status update is: it must hold whether the payment was
-- confirmed by bKash, by Stripe, or by a manual correction.
CREATE OR REPLACE FUNCTION apply_successful_payment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_previous "ShareStatus";
BEGIN
  IF NEW.status = 'SUCCEEDED'
     AND OLD.status IS DISTINCT FROM 'SUCCEEDED'
     AND NEW.expense_share_id IS NOT NULL THEN

    SELECT status INTO v_previous FROM "expense_shares" WHERE id = NEW.expense_share_id;

    UPDATE "expense_shares"
    SET status = 'PAID', settled_at = now()
    WHERE id = NEW.expense_share_id;

    -- Only when it actually changed, so a repeated webhook cannot pad the log.
    IF v_previous IS DISTINCT FROM 'PAID' THEN
      INSERT INTO "expense_share_events" (id, share_id, actor_id, from_status, to_status, note, created_at)
      VALUES (
        gen_random_uuid()::text,
        NEW.expense_share_id,
        NEW.user_id,
        v_previous,
        'PAID',
        'Settled by ' || NEW.provider || ' payment',
        now()
      );
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
