-- M2.3 <-> M2.1: give a meal-generated expense a real foreign key.
--
-- The link used to be the string "MEAL:<id>" written into `description` and
-- found with a LIKE-free equality scan. That column is free text a resident
-- can type into, it carries no referential integrity, and it has no index, so
-- every attendance sync scanned the whole expenses table.

ALTER TABLE "expenses" ADD COLUMN "meal_id" TEXT;

-- Backfill from the old marker. DISTINCT ON picks a single expense per meal:
-- the old code looked its row up with findFirst, so nothing prevented two
-- expenses claiming the same meal, and the unique index below would refuse to
-- be created if that had ever happened.
UPDATE "expenses" e
SET "meal_id" = sub.meal_id
FROM (
  SELECT DISTINCT ON (m.id) e2.id AS expense_id, m.id AS meal_id
  FROM "expenses" e2
  JOIN "meals" m ON e2."description" = 'MEAL:' || m.id
  ORDER BY m.id, e2."created_at" ASC
) sub
WHERE e.id = sub.expense_id;

-- The marker was bookkeeping, never something a person wrote, and it would
-- otherwise show up as the expense's note in the wallet.
UPDATE "expenses"
SET "description" = NULL
WHERE "meal_id" IS NOT NULL AND "description" LIKE 'MEAL:%';

CREATE UNIQUE INDEX "expenses_meal_id_key" ON "expenses"("meal_id");

-- SetNull, not Cascade: deleting a meal slot must not delete money that has
-- already been charged and possibly paid.
ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_meal_id_fkey"
  FOREIGN KEY ("meal_id") REFERENCES "meals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
