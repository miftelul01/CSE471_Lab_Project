-- CreateEnum
CREATE TYPE "PreferenceWeight" AS ENUM ('MUST_HAVE', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "GuestPolicy" AS ENUM ('RARELY', 'OCCASIONALLY', 'FREQUENTLY');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('USER', 'LISTING', 'ROOMMATE_POST');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'DISMISSED', 'ACTIONED');

-- AlterEnum
-- This partial index (from domain_rules/migration.sql) isn't tracked by
-- Prisma's schema and depends on the status column's enum type — it has to
-- be dropped before the type swap and recreated after, or Postgres refuses
-- the ALTER COLUMN TYPE with "operator does not exist: JoinRequestStatus_new
-- = JoinRequestStatus".
DROP INDEX IF EXISTS "join_requests_one_open_per_listing";

CREATE TYPE "JoinRequestStatus_new" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED');
ALTER TABLE "public"."join_requests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."roommate_applications" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "join_requests" ALTER COLUMN "status" TYPE "JoinRequestStatus_new" USING ("status"::text::"JoinRequestStatus_new");
ALTER TABLE "roommate_applications" ALTER COLUMN "status" TYPE "JoinRequestStatus_new" USING ("status"::text::"JoinRequestStatus_new");
ALTER TYPE "JoinRequestStatus" RENAME TO "JoinRequestStatus_old";
ALTER TYPE "JoinRequestStatus_new" RENAME TO "JoinRequestStatus";
DROP TYPE "public"."JoinRequestStatus_old";
ALTER TABLE "join_requests" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "roommate_applications" ALTER COLUMN "status" SET DEFAULT 'PENDING';

CREATE UNIQUE INDEX "join_requests_one_open_per_listing"
  ON "join_requests" (user_id, listing_id)
  WHERE status = 'PENDING';

-- AlterTable
ALTER TABLE "listings" DROP COLUMN "cleanliness",
ADD COLUMN     "cleanliness_level" INTEGER;

-- AlterTable
ALTER TABLE "preferences" DROP COLUMN "cleanliness",
ADD COLUMN     "budget_weight" "PreferenceWeight" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "cleanliness_level" INTEGER NOT NULL,
ADD COLUMN     "cleanliness_weight" "PreferenceWeight" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "guest_policy" "GuestPolicy" NOT NULL DEFAULT 'OCCASIONALLY',
ADD COLUMN     "guest_weight" "PreferenceWeight" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "noise_tolerance" INTEGER NOT NULL,
ADD COLUMN     "noise_weight" "PreferenceWeight" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "pets_weight" "PreferenceWeight" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "sleep_weight" "PreferenceWeight" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "smoking_weight" "PreferenceWeight" NOT NULL DEFAULT 'MEDIUM';

-- AlterTable
ALTER TABLE "roommate_posts" DROP COLUMN "cleanliness",
ADD COLUMN     "cleanliness_level" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "match_rating_penalty" INTEGER NOT NULL DEFAULT 0;

-- DropEnum
DROP TYPE "CleanlinessLevel";

-- CreateTable
CREATE TABLE "roommate_match_requests" (
    "id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roommate_match_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "listing_id" TEXT,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "id" TEXT NOT NULL,
    "blocker_id" TEXT NOT NULL,
    "blocked_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "target_type" "ReportTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "phone" TEXT,
    "note" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roommate_match_requests_receiver_id_idx" ON "roommate_match_requests"("receiver_id");

-- CreateIndex
CREATE UNIQUE INDEX "roommate_match_requests_sender_id_receiver_id_key" ON "roommate_match_requests"("sender_id", "receiver_id");

-- CreateIndex
CREATE INDEX "messages_sender_id_recipient_id_created_at_idx" ON "messages"("sender_id", "recipient_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_recipient_id_read_at_idx" ON "messages"("recipient_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_blocks_blocker_id_blocked_id_key" ON "user_blocks"("blocker_id", "blocked_id");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "verification_requests_user_id_status_idx" ON "verification_requests"("user_id", "status");

-- AddForeignKey
ALTER TABLE "roommate_match_requests" ADD CONSTRAINT "roommate_match_requests_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roommate_match_requests" ADD CONSTRAINT "roommate_match_requests_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Extra guards (added by hand, matching the CHECK-constraint pattern in
--    domain_rules/migration.sql — a plain @db.Int can't express a range) ────

ALTER TABLE "preferences"
  ADD CONSTRAINT preferences_cleanliness_range CHECK (cleanliness_level BETWEEN 1 AND 5),
  ADD CONSTRAINT preferences_noise_range CHECK (noise_tolerance BETWEEN 1 AND 5);

ALTER TABLE "listings"
  ADD CONSTRAINT listings_cleanliness_range CHECK (cleanliness_level IS NULL OR cleanliness_level BETWEEN 1 AND 5);

ALTER TABLE "roommate_posts"
  ADD CONSTRAINT roommate_posts_cleanliness_range CHECK (cleanliness_level IS NULL OR cleanliness_level BETWEEN 1 AND 5);

ALTER TABLE "roommate_match_requests"
  ADD CONSTRAINT roommate_match_requests_not_self CHECK (sender_id != receiver_id);

ALTER TABLE "user_blocks"
  ADD CONSTRAINT user_blocks_not_self CHECK (blocker_id != blocked_id);
