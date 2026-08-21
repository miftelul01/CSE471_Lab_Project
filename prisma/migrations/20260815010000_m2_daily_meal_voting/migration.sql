-- CreateEnum
CREATE TYPE "DietaryTag" AS ENUM ('VEGETARIAN', 'VEGAN', 'HALAL', 'NO_BEEF', 'NO_PORK', 'NUT_FREE', 'DAIRY_FREE');

-- CreateEnum
CREATE TYPE "NutritionProfile" AS ENUM ('LIGHT', 'BALANCED', 'PROTEIN_HEAVY');

-- CreateEnum
CREATE TYPE "DailyVoteStatus" AS ENUM ('OPEN', 'TIE_RUNOFF', 'EMERGENCY_REVOTE', 'DECIDED', 'FALLBACK');

-- CreateEnum
CREATE TYPE "VoteRound" AS ENUM ('MAIN', 'TIE_RUNOFF', 'EMERGENCY');

-- DropForeignKey
ALTER TABLE "meals" DROP CONSTRAINT "meals_menu_proposal_id_fkey";

-- DropForeignKey
ALTER TABLE "menu_proposal_items" DROP CONSTRAINT "menu_proposal_items_proposal_id_fkey";

-- DropForeignKey
ALTER TABLE "menu_proposals" DROP CONSTRAINT "menu_proposals_house_id_fkey";

-- DropForeignKey
ALTER TABLE "menu_proposals" DROP CONSTRAINT "menu_proposals_proposed_by_fkey";

-- DropForeignKey
ALTER TABLE "menu_votes" DROP CONSTRAINT "menu_votes_proposal_id_fkey";

-- DropForeignKey
ALTER TABLE "menu_votes" DROP CONSTRAINT "menu_votes_user_id_fkey";

-- AlterTable
ALTER TABLE "houses" ADD COLUMN     "default_safe_meal" TEXT;

-- AlterTable
ALTER TABLE "meals" DROP COLUMN "menu_proposal_id",
ADD COLUMN     "day_proposal_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "dietary_restrictions" "DietaryTag"[];

-- DropTable
DROP TABLE "menu_proposal_items";

-- DropTable
DROP TABLE "menu_proposals";

-- DropTable
DROP TABLE "menu_votes";

-- DropEnum
DROP TYPE "ProposalStatus";

-- CreateTable
CREATE TABLE "day_proposals" (
    "id" TEXT NOT NULL,
    "house_id" TEXT NOT NULL,
    "proposed_by" TEXT NOT NULL,
    "week_start_date" DATE NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "breakfast" TEXT,
    "lunch" TEXT,
    "dinner" TEXT,
    "estimated_cost_per_head" DECIMAL(10,2),
    "nutrition_profile" "NutritionProfile",
    "dietary_tags" "DietaryTag"[],
    "source_template_id" TEXT,
    "withdrawn_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "day_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_meal_results" (
    "id" TEXT NOT NULL,
    "house_id" TEXT NOT NULL,
    "week_start_date" DATE NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "status" "DailyVoteStatus" NOT NULL DEFAULT 'OPEN',
    "winning_proposal_id" TEXT,
    "fallback_reason" TEXT,
    "extended_until" TIMESTAMP(3),
    "tie_candidate_ids" TEXT[],
    "round_deadline" TIMESTAMP(3),
    "emergency_reason" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_meal_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_ballots" (
    "id" TEXT NOT NULL,
    "result_id" TEXT NOT NULL,
    "voter_id" TEXT NOT NULL,
    "round" "VoteRound" NOT NULL DEFAULT 'MAIN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_ballots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_ballot_rankings" (
    "id" TEXT NOT NULL,
    "ballot_id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "rank" SMALLINT NOT NULL,

    CONSTRAINT "daily_ballot_rankings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_templates" (
    "id" TEXT NOT NULL,
    "house_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "breakfast" TEXT,
    "lunch" TEXT,
    "dinner" TEXT,
    "estimated_cost_per_head" DECIMAL(10,2),
    "nutrition_profile" "NutritionProfile",
    "dietary_tags" "DietaryTag"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_ratings" (
    "id" TEXT NOT NULL,
    "meal_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stars" SMALLINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "day_proposals_house_id_week_start_date_day_of_week_idx" ON "day_proposals"("house_id", "week_start_date", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "daily_meal_results_house_id_week_start_date_day_of_week_key" ON "daily_meal_results"("house_id", "week_start_date", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "daily_ballots_result_id_voter_id_round_key" ON "daily_ballots"("result_id", "voter_id", "round");

-- CreateIndex
CREATE UNIQUE INDEX "daily_ballot_rankings_ballot_id_proposal_id_key" ON "daily_ballot_rankings"("ballot_id", "proposal_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_ballot_rankings_ballot_id_rank_key" ON "daily_ballot_rankings"("ballot_id", "rank");

-- CreateIndex
CREATE INDEX "menu_templates_house_id_idx" ON "menu_templates"("house_id");

-- CreateIndex
CREATE UNIQUE INDEX "meal_ratings_meal_id_user_id_key" ON "meal_ratings"("meal_id", "user_id");

-- AddForeignKey
ALTER TABLE "day_proposals" ADD CONSTRAINT "day_proposals_source_template_id_fkey" FOREIGN KEY ("source_template_id") REFERENCES "menu_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_proposals" ADD CONSTRAINT "day_proposals_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_proposals" ADD CONSTRAINT "day_proposals_proposed_by_fkey" FOREIGN KEY ("proposed_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_meal_results" ADD CONSTRAINT "daily_meal_results_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_meal_results" ADD CONSTRAINT "daily_meal_results_winning_proposal_fkey" FOREIGN KEY ("winning_proposal_id") REFERENCES "day_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_ballots" ADD CONSTRAINT "daily_ballots_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "daily_meal_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_ballots" ADD CONSTRAINT "daily_ballots_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_ballot_rankings" ADD CONSTRAINT "daily_ballot_rankings_ballot_id_fkey" FOREIGN KEY ("ballot_id") REFERENCES "daily_ballots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_ballot_rankings" ADD CONSTRAINT "daily_ballot_rankings_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "day_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_templates" ADD CONSTRAINT "menu_templates_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_templates" ADD CONSTRAINT "menu_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meals" ADD CONSTRAINT "meals_day_proposal_id_fkey" FOREIGN KEY ("day_proposal_id") REFERENCES "day_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_ratings" ADD CONSTRAINT "meal_ratings_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_ratings" ADD CONSTRAINT "meal_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Business-rule constraints (hand-appended, same pattern as
-- menu_proposal_items_day_range / join_requests_one_open_per_listing).

-- One ACTIVE (non-withdrawn) candidate per resident per day.
CREATE UNIQUE INDEX "day_proposals_one_active_per_resident_per_day"
  ON "day_proposals" (house_id, week_start_date, day_of_week, proposed_by)
  WHERE withdrawn_at IS NULL;

ALTER TABLE "day_proposals"
  ADD CONSTRAINT day_proposals_day_range CHECK (day_of_week BETWEEN 0 AND 6);

ALTER TABLE "daily_meal_results"
  ADD CONSTRAINT daily_meal_results_day_range CHECK (day_of_week BETWEEN 0 AND 6);

ALTER TABLE "meal_ratings"
  ADD CONSTRAINT meal_ratings_stars_range CHECK (stars BETWEEN 1 AND 5);
