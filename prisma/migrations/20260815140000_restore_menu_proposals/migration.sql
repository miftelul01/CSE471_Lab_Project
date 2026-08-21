-- Restore the M2.2 weekly-menu tables this branch's code depends on.
--
-- ── WHAT HAPPENED ───────────────────────────────────────────────────────────
-- `menu_proposals`, `menu_proposal_items` and `menu_votes` were created by the
-- init migration and are still declared in schema.prisma, but they are absent
-- from the database. No migration in this folder drops them. They were removed
-- out-of-band by a `prisma db push` run against the shared database from a
-- newer, in-progress redesign of M2.2 — the one that introduced `day_proposals`,
-- `daily_ballots`, `daily_ballot_rankings`, `daily_meal_results`,
-- `menu_templates` and `meal_ratings`, and swapped `meals.menu_proposal_id` for
-- `meals.day_proposal_id`.
--
-- `db push` synchronises the database to a schema file without recording a
-- migration, so the history said these tables existed while the database
-- disagreed. The visible symptom was HTTP 500 on /menu (M2.2) and on /meals
-- (M2.3, which reads the week's approved menu).
--
-- ── WHY THIS MIGRATION IS ADDITIVE ONLY ─────────────────────────────────────
-- `prisma migrate diff` against schema.prisma proposes dropping every table in
-- that redesign, because this branch's schema has never heard of them. Running
-- it would delete a teammate's work-in-progress from the shared database.
--
-- So this migration only ADDS. The redesign's tables, columns and enums are
-- left exactly as they are; the two designs coexist until that branch merges
-- and one of them is deliberately retired. `meals` ends up with both
-- `menu_proposal_id` and `day_proposal_id`, each nullable, each with its own
-- foreign key — which is the honest representation of "two designs are live in
-- this database right now".

-- ── Enum ────────────────────────────────────────────────────────────────────
-- Dropped along with the tables that referenced it. Guarded so this migration
-- stays safe to re-run against a database where it survived.

DO $$
BEGIN
  CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'OPEN', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- ── Tables ──────────────────────────────────────────────────────────────────
-- Column-for-column as the init migration defined them, so the restored schema
-- matches what schema.prisma and the M2.2 route handlers expect.

CREATE TABLE IF NOT EXISTS "menu_proposals" (
    "id" TEXT NOT NULL,
    "house_id" TEXT NOT NULL,
    "proposed_by" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "week_start_date" DATE NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'OPEN',
    "voting_closes_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "menu_proposal_items" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "meal_type" "MealType" NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "menu_proposal_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "menu_votes" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vote" SMALLINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_votes_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "menu_proposals_house_id_week_start_date_idx"
  ON "menu_proposals"("house_id", "week_start_date" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "menu_proposal_items_proposal_id_day_of_week_meal_type_key"
  ON "menu_proposal_items"("proposal_id", "day_of_week", "meal_type");

CREATE UNIQUE INDEX IF NOT EXISTS "menu_votes_proposal_id_user_id_key"
  ON "menu_votes"("proposal_id", "user_id");

-- From 20260807203141_domain_rules. The close-voting endpoint relies on this:
-- it is what stops two admins closing the same week from both landing an
-- APPROVED row.
CREATE UNIQUE INDEX IF NOT EXISTS "menu_proposals_one_approved_per_week"
  ON "menu_proposals" (house_id, week_start_date)
  WHERE status = 'APPROVED';

-- ── Check constraints ───────────────────────────────────────────────────────
-- Also from domain_rules. The vote endpoint validates in application code
-- first; these are the last line of defence.

ALTER TABLE "menu_votes"
  DROP CONSTRAINT IF EXISTS menu_votes_value;
ALTER TABLE "menu_votes"
  ADD CONSTRAINT menu_votes_value CHECK (vote IN (-1, 1));

ALTER TABLE "menu_proposal_items"
  DROP CONSTRAINT IF EXISTS menu_proposal_items_day_range;
ALTER TABLE "menu_proposal_items"
  ADD CONSTRAINT menu_proposal_items_day_range CHECK (day_of_week BETWEEN 0 AND 6);

-- ── Foreign keys ────────────────────────────────────────────────────────────

ALTER TABLE "menu_proposals"
  DROP CONSTRAINT IF EXISTS "menu_proposals_house_id_fkey";
ALTER TABLE "menu_proposals"
  ADD CONSTRAINT "menu_proposals_house_id_fkey"
  FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_proposals"
  DROP CONSTRAINT IF EXISTS "menu_proposals_proposed_by_fkey";
ALTER TABLE "menu_proposals"
  ADD CONSTRAINT "menu_proposals_proposed_by_fkey"
  FOREIGN KEY ("proposed_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_proposal_items"
  DROP CONSTRAINT IF EXISTS "menu_proposal_items_proposal_id_fkey";
ALTER TABLE "menu_proposal_items"
  ADD CONSTRAINT "menu_proposal_items_proposal_id_fkey"
  FOREIGN KEY ("proposal_id") REFERENCES "menu_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_votes"
  DROP CONSTRAINT IF EXISTS "menu_votes_proposal_id_fkey";
ALTER TABLE "menu_votes"
  ADD CONSTRAINT "menu_votes_proposal_id_fkey"
  FOREIGN KEY ("proposal_id") REFERENCES "menu_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_votes"
  DROP CONSTRAINT IF EXISTS "menu_votes_user_id_fkey";
ALTER TABLE "menu_votes"
  ADD CONSTRAINT "menu_votes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Reconnect the meal slot to the week's menu ──────────────────────────────
-- `day_proposal_id` is deliberately left in place beside this. Dropping it
-- would take the redesign's link with it, and nothing on this branch reads it.

ALTER TABLE "meals" ADD COLUMN IF NOT EXISTS "menu_proposal_id" TEXT;

ALTER TABLE "meals"
  DROP CONSTRAINT IF EXISTS "meals_menu_proposal_id_fkey";
ALTER TABLE "meals"
  ADD CONSTRAINT "meals_menu_proposal_id_fkey"
  FOREIGN KEY ("menu_proposal_id") REFERENCES "menu_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
