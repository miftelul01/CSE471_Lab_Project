-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('PUBLISHED', 'REMOVED');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "removed_at" TIMESTAMP(3),
ADD COLUMN     "removed_by" TEXT,
ADD COLUMN     "removed_reason" TEXT,
ADD COLUMN     "status" "PostStatus" NOT NULL DEFAULT 'PUBLISHED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "suspended_reason" TEXT;

-- CreateTable
CREATE TABLE "roommate_posts" (
    "id" TEXT NOT NULL,
    "house_id" TEXT NOT NULL,
    "posted_by" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "monthly_share" DECIMAL(10,2) NOT NULL,
    "seats_available" INTEGER NOT NULL DEFAULT 1,
    "available_from" DATE,
    "sleep_schedule" "SleepSchedule",
    "cleanliness" "CleanlinessLevel",
    "smoking_ok" BOOLEAN,
    "pets_ok" BOOLEAN,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "status" "PostStatus" NOT NULL DEFAULT 'PUBLISHED',
    "removed_reason" TEXT,
    "removed_at" TIMESTAMP(3),
    "removed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roommate_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roommate_applications" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roommate_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roommate_posts_house_id_idx" ON "roommate_posts"("house_id");

-- CreateIndex
CREATE INDEX "roommate_posts_is_active_monthly_share_idx" ON "roommate_posts"("is_active", "monthly_share");

-- CreateIndex
CREATE INDEX "roommate_applications_post_id_idx" ON "roommate_applications"("post_id");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roommate_posts" ADD CONSTRAINT "roommate_posts_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roommate_posts" ADD CONSTRAINT "roommate_posts_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roommate_posts" ADD CONSTRAINT "roommate_posts_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roommate_applications" ADD CONSTRAINT "roommate_applications_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "roommate_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roommate_applications" ADD CONSTRAINT "roommate_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
