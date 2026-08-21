-- Cleanup: this shared dev database currently has stale tables/columns from
-- an older schema.prisma that predates the M2.2 daily-meal-voting rebuild
-- (menu_proposals / menu_proposal_items / menu_votes / ProposalStatus, and a
-- leftover meals.menu_proposal_id column) — evidently reintroduced by a
-- `prisma db push` from an out-of-date local checkout, since `_prisma_migrations`
-- never recorded it. All three tables are confirmed empty (0 rows). This
-- migration brings the live database back in line with the committed
-- prisma/schema.prisma, which has never had these since the M2.2 rebuild.
--
-- NOTE: the raw `prisma migrate diff` this was generated from also proposed
-- dropping "bookmark_notes_body_trgm_idx" and "bookmarks_name_trgm_idx" —
-- those are real, hand-added pg_trgm search indexes for M2.4's live search
-- feature (not expressible in schema.prisma's DSL, so the diff tool can't
-- tell they're intentional). They are deliberately NOT included below.

-- DropForeignKey
ALTER TABLE "meals" DROP CONSTRAINT IF EXISTS "meals_menu_proposal_id_fkey";

-- DropForeignKey
ALTER TABLE "menu_proposal_items" DROP CONSTRAINT IF EXISTS "menu_proposal_items_proposal_id_fkey";

-- DropForeignKey
ALTER TABLE "menu_proposals" DROP CONSTRAINT IF EXISTS "menu_proposals_house_id_fkey";

-- DropForeignKey
ALTER TABLE "menu_proposals" DROP CONSTRAINT IF EXISTS "menu_proposals_proposed_by_fkey";

-- DropForeignKey
ALTER TABLE "menu_votes" DROP CONSTRAINT IF EXISTS "menu_votes_proposal_id_fkey";

-- DropForeignKey
ALTER TABLE "menu_votes" DROP CONSTRAINT IF EXISTS "menu_votes_user_id_fkey";

-- AlterTable
ALTER TABLE "meals" DROP COLUMN IF EXISTS "menu_proposal_id";

-- DropTable
DROP TABLE IF EXISTS "menu_proposal_items";

-- DropTable
DROP TABLE IF EXISTS "menu_proposals";

-- DropTable
DROP TABLE IF EXISTS "menu_votes";

-- DropEnum
DROP TYPE IF EXISTS "ProposalStatus";

-- M3.3 Listings Map & Commute Evaluation

-- CreateTable
CREATE TABLE "saved_commute_searches" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "origin_address" TEXT NOT NULL,
    "origin_lat" DOUBLE PRECISION NOT NULL,
    "origin_lng" DOUBLE PRECISION NOT NULL,
    "max_commute_minutes" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_commute_searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_commute_searches_user_id_created_at_idx" ON "saved_commute_searches"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "saved_commute_searches" ADD CONSTRAINT "saved_commute_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
