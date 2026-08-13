-- DropForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_paid_by_fkey";

-- AlterTable
ALTER TABLE "expenses" ALTER COLUMN "paid_by" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
