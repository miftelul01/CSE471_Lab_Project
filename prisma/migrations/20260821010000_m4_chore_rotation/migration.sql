-- NOTE: the raw `prisma migrate diff` this was generated from also proposed
-- dropping "bookmark_notes_body_trgm_idx" and "bookmarks_name_trgm_idx" —
-- those are real, hand-added pg_trgm search indexes for M2.4's live search
-- feature (not expressible in schema.prisma's DSL, so the diff tool can't
-- tell they're intentional). They are deliberately NOT included below,
-- same as the previous M3.3 migration.

-- CreateEnum
CREATE TYPE "ChoreMarketplaceStatus" AS ENUM ('OPEN', 'CLAIMED', 'CANCELLED');

-- AlterTable
ALTER TABLE "chore_assignments" ADD COLUMN     "google_sync_pending_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "chores" ADD COLUMN     "due_day_of_week" SMALLINT;

-- AlterTable
ALTER TABLE "google_credentials" ADD COLUMN     "needs_reconnect_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "houses" ADD COLUMN     "chore_quality_rating_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "chore_absences" (
    "id" TEXT NOT NULL,
    "house_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chore_absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chore_swap_requests" (
    "id" TEXT NOT NULL,
    "proposer_assignment_id" TEXT NOT NULL,
    "target_assignment_id" TEXT NOT NULL,
    "proposer_user_id" TEXT NOT NULL,
    "target_user_id" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chore_swap_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chore_marketplace_posts" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "posted_by" TEXT NOT NULL,
    "status" "ChoreMarketplaceStatus" NOT NULL DEFAULT 'OPEN',
    "claimed_by" TEXT,
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chore_marketplace_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chore_subtasks" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ChoreAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMP(3),
    "google_task_id" TEXT,
    "google_sync_pending_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chore_subtasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chore_quality_ratings" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "score" SMALLINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chore_quality_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chore_absences_user_id_start_date_idx" ON "chore_absences"("user_id", "start_date");

-- CreateIndex
CREATE INDEX "chore_absences_house_id_start_date_idx" ON "chore_absences"("house_id", "start_date");

-- CreateIndex
CREATE INDEX "chore_swap_requests_target_user_id_status_idx" ON "chore_swap_requests"("target_user_id", "status");

-- CreateIndex
CREATE INDEX "chore_swap_requests_proposer_assignment_id_idx" ON "chore_swap_requests"("proposer_assignment_id");

-- CreateIndex
CREATE INDEX "chore_marketplace_posts_assignment_id_idx" ON "chore_marketplace_posts"("assignment_id");

-- CreateIndex
CREATE INDEX "chore_subtasks_assignment_id_idx" ON "chore_subtasks"("assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "chore_quality_ratings_assignment_id_user_id_key" ON "chore_quality_ratings"("assignment_id", "user_id");

-- AddForeignKey
ALTER TABLE "chore_absences" ADD CONSTRAINT "chore_absences_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore_absences" ADD CONSTRAINT "chore_absences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore_swap_requests" ADD CONSTRAINT "chore_swap_requests_proposer_assignment_id_fkey" FOREIGN KEY ("proposer_assignment_id") REFERENCES "chore_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore_swap_requests" ADD CONSTRAINT "chore_swap_requests_target_assignment_id_fkey" FOREIGN KEY ("target_assignment_id") REFERENCES "chore_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore_swap_requests" ADD CONSTRAINT "chore_swap_requests_proposer_user_id_fkey" FOREIGN KEY ("proposer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore_swap_requests" ADD CONSTRAINT "chore_swap_requests_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore_marketplace_posts" ADD CONSTRAINT "chore_marketplace_posts_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "chore_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore_marketplace_posts" ADD CONSTRAINT "chore_marketplace_posts_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore_marketplace_posts" ADD CONSTRAINT "chore_marketplace_posts_claimed_by_fkey" FOREIGN KEY ("claimed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore_subtasks" ADD CONSTRAINT "chore_subtasks_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "chore_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore_subtasks" ADD CONSTRAINT "chore_subtasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore_quality_ratings" ADD CONSTRAINT "chore_quality_ratings_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "chore_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore_quality_ratings" ADD CONSTRAINT "chore_quality_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
